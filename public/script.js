document.addEventListener("DOMContentLoaded", function() {
  // Socket.IO 初期化（接続先URLは実際のRenderサーバーのURLに合わせてください）
  const socket = io();

  // グローバル変数
  let currentUser = null;
  let currentChatFriend = null;

  // DOM要素取得
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

  const openSettingsBtn = document.getElementById("open-settings");
  const settingsPanel = document.getElementById("settings-panel");
  const closeSettingsBtn = document.getElementById("close-settings");
  const settingsForm = document.getElementById("settings-form");

  // ページ切替（フェードアウト・フェードイン）
  function showPage(showElem) {
    document.querySelectorAll('.page').forEach(page => {
      page.style.opacity = 0;
      setTimeout(() => { page.style.display = "none"; }, 500);
    });
    setTimeout(() => {
      showElem.style.display = "block";
      setTimeout(() => { showElem.style.opacity = 1; }, 50);
    }, 500);
  }

  // フォーム切替
  toRegistrationBtn.addEventListener("click", function() {
    loginDiv.style.display = "none";
    registrationDiv.style.display = "block";
  });
  toLoginBtn.addEventListener("click", function() {
    registrationDiv.style.display = "none";
    loginDiv.style.display = "block";
  });

  // 新規ユーザー登録
  registrationForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const username = document.getElementById("register-username").value;
    const password = document.getElementById("register-password").value;
    try {
      const res = await fetch('/server/register', {
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
      const res = await fetch('/server/login', {
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
    showPage(pageHome);
    socket.emit('join', currentUser.username);
    loadApprovedFriends();
    loadFriendRequests();
  }

  // 承認済み友達一覧取得
  async function loadApprovedFriends() {
    try {
      const res = await fetch(`/server/approvedFriends?username=${currentUser.username}`);
      const data = await res.json();
      renderApprovedFriends(data.approvedFriends);
    } catch(err) {
      console.error(err);
    }
  }

  // 承認済み友達リストレンダリング
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

  // 友達リクエスト取得
  async function loadFriendRequests() {
    try {
      const res = await fetch(`/server/friendRequests?username=${currentUser.username}`);
      const data = await res.json();
      renderFriendRequests(data.friendRequests);
    } catch(err) {
      console.error(err);
    }
  }

  // 友達リクエストレンダリング
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

  // 友達リクエスト応答
  async function respondFriendRequest(from, response) {
    try {
      const res = await fetch('/server/respondFriendRequest', {
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

  // ユーザー検索（結果は検索欄の下にリスト表示）
  userSearchInput.addEventListener("input", async function() {
    const query = this.value.trim().toLowerCase();
    searchResultUl.innerHTML = "";
    if(query === "") return;
    try {
      const res = await fetch(`/server/users?username=${currentUser.username}`);
      const data = await res.json();
      const results = data.users.filter(u => u.toLowerCase().includes(query));
      results.forEach(user => {
        const li = document.createElement("li");
        li.textContent = user;
        li.className = "contact-item";
        li.addEventListener("click", async function() {
          // 友達追加リクエスト送信
          try {
            const res = await fetch('/server/sendFriendRequest', {
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

  // 設定パネルの表示／非表示
  openSettingsBtn.addEventListener("click", function() {
    settingsPanel.style.display = "block";
  });
  closeSettingsBtn.addEventListener("click", function() {
    settingsPanel.style.display = "none";
  });

  // 設定更新
  settingsForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const newUsername = document.getElementById("new-username").value;
    const newPassword = document.getElementById("new-password").value;
    const birthday = document.getElementById("birthday").value;
    if(confirm("設定を保存しますか？")) {
      try {
        const res = await fetch('/server/updateUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: currentUser.username,
            newUsername,
            newPassword,
            birthday
          })
        });
        const data = await res.json();
        alert(data.message);
        currentUser = data.user;
        displayUsername.value = currentUser.username;
        settingsPanel.style.display = "none";
      } catch(err) {
        console.error(err);
      }
    }
  });

  // チャット画面を開く（履歴取得＆既読処理）
  function openChat(friend) {
    currentChatFriend = friend;
    showPage(pageChat);
    messageHistory.innerHTML = "";
    fetch(`/server/chatHistory?user1=${currentUser.username}&user2=${friend}`)
      .then(res => res.json())
      .then(data => {
         if(data.chatHistory && data.chatHistory.length > 0) {
             data.chatHistory.forEach(msgObj => {
                 appendMessage(msgObj);
             });
         } else {
             const welcome = document.createElement("div");
             welcome.textContent = "チャット開始: " + friend;
             messageHistory.appendChild(welcome);
         }
         messageHistory.scrollTop = messageHistory.scrollHeight;
         socket.emit('markRead', { user1: currentUser.username, user2: friend });
      })
      .catch(err => {
         console.error(err);
         const welcome = document.createElement("div");
         welcome.textContent = "チャット開始: " + friend;
         messageHistory.appendChild(welcome);
      });
  }

  // メッセージ追加（左右配置、タイムスタンプ、既読状態付き）
  function appendMessage(msgObj) {
    const div = document.createElement("div");
    if(msgObj.from === currentUser.username) {
      div.className = "message-self";
    } else {
      div.className = "message-other";
    }
    const textDiv = document.createElement("div");
    textDiv.textContent = msgObj.message;
    div.appendChild(textDiv);
    const ts = document.createElement("span");
    ts.className = "timestamp";
    ts.textContent = new Date(msgObj.timestamp).toLocaleString();
    div.appendChild(ts);
    if(msgObj.from === currentUser.username) {
      div.setAttribute("data-id", msgObj.id);
      const readStatus = document.createElement("span");
      readStatus.className = "read-status";
      readStatus.textContent = msgObj.read ? "既読" : "未読";
      div.appendChild(readStatus);
    }
    messageHistory.appendChild(div);
  }

  // チャット送信処理
  sendMessageBtn.addEventListener("click", function() {
    const msg = chatInput.value.trim();
    if(msg === "" || !currentChatFriend) return;
    const msgId = Date.now() + '-' + Math.floor(Math.random()*1000);
    const timestamp = new Date().toISOString();
    const msgObj = {
      id: msgId,
      from: currentUser.username,
      to: currentChatFriend,
      message: msg,
      timestamp: timestamp,
      read: false
    };
    appendMessage(msgObj);
    socket.emit('private message', { to: currentChatFriend, message: msg });
    chatInput.value = "";
    messageHistory.scrollTop = messageHistory.scrollHeight;
  });

  // プライベートメッセージ受信
  socket.on('private message', (data) => {
    appendMessage(data);
    messageHistory.scrollTop = messageHistory.scrollHeight;
  });

  // 既読通知受信
  socket.on('readReceipt', (data) => {
    data.messageIds.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"] .read-status`);
      if (el) {
        el.textContent = "既読";
      }
    });
  });

  // リアルタイムで友達リクエスト受信
  socket.on('friendRequest', (data) => {
    alert("新しい友達リクエスト: " + data.from);
    loadFriendRequests();
  });
});
