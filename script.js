document.addEventListener("DOMContentLoaded", function() {
  // Socket.IO 初期化（接続先URLはサーバーの実際のURLに合わせる）
  const socket = io();

  // グローバル変数
  let currentUser = null;
  let currentChatFriend = null;
  let currentReply = null; // リプライ対象のメッセージオブジェクト

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
  const replyPreview = document.getElementById("reply-preview");

  const openSettingsBtn = document.getElementById("open-settings");
  const settingsPanel = document.getElementById("settings-panel");
  const closeSettingsBtn = document.getElementById("close-settings");
  const settingsForm = document.getElementById("settings-form");

  /*---------------------------
    ページ・フォーム切替用の関数
  ---------------------------*/
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
  
  // 滑らかなフォーム切替（ログイン⇔新規登録）
  function fadeOut(elem, callback) {
    elem.style.opacity = 0;
    setTimeout(() => {
      elem.style.display = "none";
      if (callback) callback();
    }, 500);
  }
  function fadeIn(elem) {
    elem.style.display = "block";
    setTimeout(() => { elem.style.opacity = 1; }, 50);
  }

  // フォーム切替ボタン
  toRegistrationBtn.addEventListener("click", function() {
    fadeOut(loginDiv, () => {
      fadeIn(registrationDiv);
    });
  });
  toLoginBtn.addEventListener("click", function() {
    fadeOut(registrationDiv, () => {
      fadeIn(loginDiv);
    });
  });

  // 新規ユーザー登録
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
    showPage(pageHome);
    socket.emit('join', currentUser.username);
    loadApprovedFriends();
    loadFriendRequests();
  }

  // 戻るボタンの機能（チャット画面からホーム画面へ戻る）
  backToHomeBtn.addEventListener("click", function() {
    showPage(pageHome);
    clearReply();
  });

  // 承認済み友達一覧取得
  async function loadApprovedFriends() {
    try {
      const res = await fetch(`/approvedFriends?username=${currentUser.username}`);
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
      const res = await fetch(`/friendRequests?username=${currentUser.username}`);
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

  // 友達リクエスト応答（リアルタイム更新）
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

  // ユーザー検索（検索結果は検索欄の下に表示）
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
        const res = await fetch('/updateUser', {
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

  // リプライ機能：返信対象を設定しプレビュー表示
  function setReply(targetMsg) {
    currentReply = targetMsg;
    replyPreview.style.display = "block";
    replyPreview.innerText = "返信対象: " + (targetMsg.message.length > 30 ? targetMsg.message.substr(0, 30) + "…" : targetMsg.message);
  }

  // クリアリプライ
  function clearReply() {
    currentReply = null;
    replyPreview.style.display = "none";
  }

  // チャット画面を開く（履歴取得＆既読処理）
  function openChat(friend) {
    currentChatFriend = friend;
    showPage(pageChat);
    messageHistory.innerHTML = "";
    fetch(`/chatHistory?user1=${currentUser.username}&user2=${friend}`)
      .then(res => res.json())
      .then(data => {
         if(data.chatHistory && data.chatHistory.length > 0) {
             data.chatHistory.forEach(msgObj => {
                 appendMessage(msgObj);
             });
         } else {
             const welcome = document.createElement("div");
             welcome.innerText = "チャット開始: " + friend;
             messageHistory.appendChild(welcome);
         }
         messageHistory.scrollTop = messageHistory.scrollHeight;
         // チャット画面が開いているので既読処理を実行
         socket.emit('markRead', { user1: currentUser.username, user2: friend });
      })
      .catch(err => {
         console.error(err);
         const welcome = document.createElement("div");
         welcome.innerText = "チャット開始: " + friend;
         messageHistory.appendChild(welcome);
      });
  }

  // メッセージ追加（左右配置、タイムスタンプ・既読状態、リプライ表示）
  function appendMessage(msgObj) {
    // 重複表示防止：自分の送信メッセージが既に追加済みならスキップ
    if (msgObj.from === currentUser.username && document.querySelector(`[data-id="${msgObj.id}"]`)) return;
    const div = document.createElement("div");
    if(msgObj.from === currentUser.username) {
      div.className = "message-self";
    } else {
      div.className = "message-other";
    }
    // リプライ表示（返信対象がある場合）
    if(msgObj.replyTo) {
      const replyDiv = document.createElement("div");
      replyDiv.className = "reply-preview";
      replyDiv.innerText = "返信: " + (msgObj.replyTo.message.length > 30 ? msgObj.replyTo.message.substr(0, 30) + "…" : msgObj.replyTo.message);
      div.appendChild(replyDiv);
    }
    const textDiv = document.createElement("div");
    textDiv.innerText = msgObj.message;
    div.appendChild(textDiv);
    // タイムスタンプと既読状態
    const infoSpan = document.createElement("span");
    infoSpan.className = "timestamp";
    infoSpan.innerText = new Date(msgObj.timestamp).toLocaleString();
    div.appendChild(infoSpan);
    if(msgObj.from === currentUser.username) {
      div.setAttribute("data-id", msgObj.id);
      const readStatus = document.createElement("span");
      readStatus.className = "read-status";
      readStatus.innerText = msgObj.read ? "既読" : "未読";
      div.appendChild(readStatus);
    }
    // 返信ボタンの追加（すべてのメッセージに対して）
    const replyBtn = document.createElement("span");
    replyBtn.className = "reply-button";
    replyBtn.innerText = "返信";
    replyBtn.addEventListener("click", function() {
      setReply(msgObj);
    });
    div.appendChild(replyBtn);
    messageHistory.appendChild(div);
  }

  // チャット送信
  sendMessageBtn.addEventListener("click", function() {
    const msg = chatInput.value.trim();
    if(msg === "" || !currentChatFriend) return;
    const msgId = Date.now() + '-' + Math.floor(Math.random() * 1000);
    const timestamp = new Date().toISOString();
    const msgObj = {
      id: msgId,
      from: currentUser.username,
      to: currentChatFriend,
      message: msg,
      timestamp: timestamp,
      read: false,
      replyTo: currentReply ? currentReply : null
    };
    appendMessage(msgObj);
    clearReply();
    socket.emit('private message', { to: currentChatFriend, message: msg, replyTo: currentReply });
    chatInput.value = "";
    messageHistory.scrollTop = messageHistory.scrollHeight;
  });

  // プライベートメッセージ受信
  socket.on('private message', (data) => {
    if(data.from !== currentUser.username) {
      appendMessage(data);
      messageHistory.scrollTop = messageHistory.scrollHeight;
      if(pageChat.style.display !== "none" && currentChatFriend === data.from) {
        socket.emit('markRead', { user1: currentUser.username, user2: data.from });
      }
      if (Notification.permission === "granted") {
        new Notification("新着メッセージ", { body: data.message });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
          if (permission === "granted") {
            new Notification("新着メッセージ", { body: data.message });
          }
        });
      }
    }
  });

  // 既読通知受信（リアルタイム更新）
  socket.on('readReceipt', (data) => {
    data.messageIds.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"] .read-status`);
      if (el) {
        el.innerText = "既読";
      }
    });
  });

  // リアルタイム友達リクエスト受信
  socket.on('friendRequest', (data) => {
    alert("新しい友達リクエスト: " + data.from);
    loadFriendRequests();
  });
  
  // リアルタイム更新で連絡可能ユーザーリスト更新
  socket.on('updateFriendList', () => {
    loadApprovedFriends();
    loadFriendRequests();
  });
});
