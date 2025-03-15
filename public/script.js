document.addEventListener("DOMContentLoaded", function() {
  // Socket.IO 初期化
  const socket = io();

  // グローバル変数
  let currentUser = null;
  let currentChatFriend = null;

  // DOM 要素取得
  const pageAuth = document.getElementById("page-auth");
  const loginForm = document.getElementById("form-login");
  const registrationForm = document.getElementById("form-register");
  const loginDiv = document.getElementById("login-form");
  const registrationDiv = document.getElementById("registration-form");
  const toRegistrationBtn = document.getElementById("to-registration");
  const toLoginBtn = document.getElementById("to-login");

  const pageHome = document.getElementById("page-home");
  const displayUsername = document.getElementById("display-username");
  const userSearchInput = document.getElementById("user-search");
  const searchResultUl = document.getElementById("search-result");
  const friendRequestsUl = document.getElementById("friend-requests");
  const contactListUl = document.getElementById("contact-list");

  const pageChat = document.getElementById("page-chat");
  const backToHomeBtn = document.getElementById("back-to-home");
  const messageHistory = document.getElementById("message-history");
  const chatInput = document.getElementById("chat-input");
  const sendMessageBtn = document.getElementById("send-message");

  // 設定モーダル用要素
  const openSettingsBtn = document.getElementById("open-settings");
  const settingsModal = document.getElementById("settings-modal");
  const closeSettingsBtn = document.getElementById("close-settings");
  const settingsForm = document.getElementById("settings-form");
  const birthdayInput = document.getElementById("birthday");
  const newUsernameInput = document.getElementById("new-username");
  const newPasswordInput = document.getElementById("new-password");

  // ページ遷移のフェードアウト／フェードイン処理
  function fadeOut(element, callback) {
    element.style.opacity = 1;
    (function fade() {
      if ((element.style.opacity -= 0.1) < 0) {
        element.style.display = "none";
        if (callback) callback();
      } else {
        requestAnimationFrame(fade);
      }
    })();
  }
  function fadeIn(element, display = "block") {
    element.style.opacity = 0;
    element.style.display = display;
    (function fade() {
      let val = parseFloat(element.style.opacity);
      if (!((val += 0.1) > 1)) {
        element.style.opacity = val;
        requestAnimationFrame(fade);
      }
    })();
  }

  // フォーム切替
  toRegistrationBtn.addEventListener("click", function() {
    fadeOut(loginDiv, () => { fadeIn(registrationDiv); });
  });
  toLoginBtn.addEventListener("click", function() {
    fadeOut(registrationDiv, () => { fadeIn(loginDiv); });
  });

  // ユーザー登録
  registrationForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const username = document.getElementById("register-username").value;
    const password = document.getElementById("register-password").value;
    try {
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if(data.error) {
        alert(data.error);
      } else {
        currentUser = data.user;
        alert("登録成功: " + currentUser.username);
        showHomePage();
      }
    } catch(err) {
      console.error(err);
    }
  });

  // ログイン処理
  loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if(data.error) {
        alert(data.error);
      } else {
        currentUser = data.user;
        alert("ログイン成功: " + currentUser.username);
        showHomePage();
      }
    } catch(err) {
      console.error(err);
    }
  });

  // ホーム画面表示
  function showHomePage() {
    displayUsername.value = currentUser.username;
    pageAuth.style.display = "none";
    fadeIn(pageHome);
    pageChat.style.display = "none";
    socket.emit('join', currentUser.username);
    loadApprovedFriends();
    loadFriendRequests();
  }

  // 承認済み友達の取得
  async function loadApprovedFriends() {
    try {
      const res = await fetch(`/approvedFriends?username=${currentUser.username}`);
      const data = await res.json();
      renderApprovedFriends(data.approvedFriends);
    } catch(err) {
      console.error(err);
    }
  }
  function renderApprovedFriends(friends) {
    contactListUl.innerHTML = "";
    friends.forEach(friend => {
      const li = document.createElement("li");
      li.textContent = friend;
      li.className = "contact-item";
      li.addEventListener("click", function() {
         openChat(friend);
      });
      contactListUl.appendChild(li);
    });
  }

  // 友達リクエストの取得とレンダリング
  async function loadFriendRequests() {
    try {
      const res = await fetch(`/friendRequests?username=${currentUser.username}`);
      const data = await res.json();
      renderFriendRequests(data.friendRequests);
    } catch(err) {
      console.error(err);
    }
  }
  function renderFriendRequests(requests) {
    friendRequestsUl.innerHTML = "";
    requests.forEach(requester => {
      const li = document.createElement("li");
      li.textContent = requester;
      li.className = "contact-item";
      const acceptBtn = document.createElement("button");
      acceptBtn.textContent = "承認";
      acceptBtn.addEventListener("click", function() {
        respondFriendRequest(requester, 'accept');
      });
      const declineBtn = document.createElement("button");
      declineBtn.textContent = "拒否";
      declineBtn.addEventListener("click", function() {
        respondFriendRequest(requester, 'decline');
      });
      li.appendChild(acceptBtn);
      li.appendChild(declineBtn);
      friendRequestsUl.appendChild(li);
    });
  }
  async function respondFriendRequest(from, response) {
    try {
      const res = await fetch('/respondFriendRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, from, response })
      });
      const data = await res.json();
      alert(data.message);
      loadFriendRequests();
      loadApprovedFriends();
    } catch(err) {
      console.error(err);
    }
  }

  // リアルタイム更新：友達リクエスト、友達リスト
  socket.on('friendRequest', (data) => { loadFriendRequests(); });
  socket.on('friendRequestUpdate', (data) => { loadApprovedFriends(); });

  // ユーザー検索機能
  userSearchInput.addEventListener("input", async function() {
    const query = this.value.trim().toLowerCase();
    searchResultUl.innerHTML = "";
    if(query === "") return;
    try {
      const res = await fetch(`/users?username=${currentUser.username}`);
      const data = await res.json();
      const results = data.users.filter(u => u.toLowerCase().includes(query));
      results.forEach(user => {
        const li = document.createElement("li");
        li.textContent = user;
        li.className = "contact-item";
        li.addEventListener("click", async function() {
          try {
            const res = await fetch('/sendFriendRequest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: currentUser.username, to: user })
            });
            const resultData = await res.json();
            alert(resultData.message || resultData.error);
          } catch(err) {
            console.error(err);
          }
        });
        searchResultUl.appendChild(li);
      });
    } catch(err) {
      console.error(err);
    }
  });

  // チャット画面を開く：チャット履歴取得と既読処理
  function openChat(friend) {
    currentChatFriend = friend;
    fadeOut(pageHome, () => {
      fadeIn(pageChat);
      messageHistory.innerHTML = "";
      fetch(`/chatHistory?user1=${currentUser.username}&user2=${friend}`)
        .then(res => res.json())
        .then(data => {
           if(data.chatHistory && data.chatHistory.length > 0) {
               data.chatHistory.forEach(msgObj => { displayMessage(msgObj); });
           } else {
               const welcome = document.createElement("div");
               welcome.textContent = "チャット開始: " + friend;
               messageHistory.appendChild(welcome);
           }
           messageHistory.scrollTop = messageHistory.scrollHeight;
           // 既読処理
           fetch('/markAsRead', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ user1: currentUser.username, user2: friend })
           });
        })
        .catch(err => {
           console.error(err);
           const welcome = document.createElement("div");
           welcome.textContent = "チャット開始: " + friend;
           messageHistory.appendChild(welcome);
        });
    });
  }

  // メッセージ表示（改行対応、左右配置、タイムスタンプ、既読表示）
  function displayMessage(msgObj) {
    const bubble = document.createElement("div");
    bubble.classList.add("message-bubble");
    const time = new Date(msgObj.timestamp);
    const timeStr = time.toLocaleString();
    // 改行を <br> タグに変換して表示
    const formattedMessage = msgObj.message.replace(/\n/g, '<br>');
    if(msgObj.from === currentUser.username) {
      bubble.classList.add("message-self");
      bubble.innerHTML = `<div>${formattedMessage}</div><div class="timestamp">${timeStr} ${msgObj.read ? '✓✓' : '✓'}</div>`;
    } else {
      bubble.classList.add("message-other");
      bubble.innerHTML = `<div>${formattedMessage}</div><div class="timestamp">${timeStr}</div>`;
    }
    messageHistory.appendChild(bubble);
  }

  // 戻るボタン：ホーム画面に遷移
  backToHomeBtn.addEventListener("click", function() {
    fadeOut(pageChat, () => { fadeIn(pageHome); });
  });

  // メッセージ送信
  sendMessageBtn.addEventListener("click", function() {
    const msg = chatInput.value.trim();
    if(msg === "" || !currentChatFriend) return;
    const messageObj = {
      from: currentUser.username,
      to: currentChatFriend,
      message: msg,
      timestamp: new Date().toISOString(),
      read: false
    };
    displayMessage(messageObj);
    socket.emit('private message', { to: currentChatFriend, message: msg });
    chatInput.value = "";
    messageHistory.scrollTop = messageHistory.scrollHeight;
  });

  // 受信メッセージ
  socket.on('private message', (data) => {
    if(data.from === currentChatFriend) {
      displayMessage(data);
      messageHistory.scrollTop = messageHistory.scrollHeight;
    }
  });

  // 設定モーダルの操作
  openSettingsBtn.addEventListener("click", function() {
    birthdayInput.value = currentUser.birthday || "";
    newUsernameInput.value = "";
    newPasswordInput.value = "";
    settingsModal.style.display = "block";
  });
  closeSettingsBtn.addEventListener("click", function() {
    settingsModal.style.display = "none";
  });
  window.addEventListener("click", function(event) {
    if (event.target == settingsModal) settingsModal.style.display = "none";
  });
  settingsForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const newBirthday = birthdayInput.value;
    const newUsername = newUsernameInput.value;
    const newPassword = newPasswordInput.value;
    if(confirm("変更内容を保存しますか？")) {
      try {
        const res = await fetch('/updateProfile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            currentUsername: currentUser.username, 
            newUsername, 
            newPassword, 
            birthday: newBirthday 
          })
        });
        const data = await res.json();
        if(data.error) {
          alert(data.error);
        } else {
          currentUser = data.user;
          displayUsername.value = currentUser.username;
          alert("プロフィールが更新されました");
          settingsModal.style.display = "none";
        }
      } catch(err) {
        console.error(err);
      }
    }
  });
});
