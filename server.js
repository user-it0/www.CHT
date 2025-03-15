const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.json());
app.use(express.static('public'));

// 永続的保存用ファイルのパス
const chatHistoryFile = path.join(__dirname, 'chatHistory.json');
const userDataFile = path.join(__dirname, 'userData.json');

// チャット履歴の読み込み
let chatHistory = {};
if (fs.existsSync(chatHistoryFile)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(chatHistoryFile));
  } catch (e) {
    console.error('Error reading chatHistory file:', e);
    chatHistory = {};
  }
}

// ユーザー情報の読み込み
let users = [];
if (fs.existsSync(userDataFile)) {
  try {
    users = JSON.parse(fs.readFileSync(userDataFile));
  } catch (e) {
    console.error('Error reading userData file:', e);
    users = [];
  }
}

// ユーティリティ：ユーザー情報を保存
function saveUsers() {
  fs.writeFile(userDataFile, JSON.stringify(users, null, 2), (err) => {
    if (err) console.error('Error saving user data:', err);
  });
}

// ユーティリティ：チャット履歴を保存
function saveChatHistory() {
  fs.writeFile(chatHistoryFile, JSON.stringify(chatHistory, null, 2), (err) => {
    if (err) console.error('Error saving chat history:', err);
  });
}

// ★ ユーザー登録
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'ユーザー名は既に存在します' });
  }
  let newUser = { username, password, birthday: null, approvedFriends: [], friendRequests: [] };
  users.push(newUser);
  saveUsers();
  res.json({ message: '登録成功', user: newUser });
});

// ★ ログイン
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  let user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: '認証失敗' });
  }
  res.json({ message: 'ログイン成功', user });
});

// ★ ユーザー一覧（自分を除く）
app.get('/users', (req, res) => {
  const { username } = req.query;
  const filtered = users.filter(u => u.username !== username).map(u => u.username);
  res.json({ users: filtered });
});

// ★ 友達追加リクエスト送信（リアルタイム通知付き）
app.post('/sendFriendRequest', (req, res) => {
  const { from, to } = req.body;
  let targetUser = users.find(u => u.username === to);
  if (!targetUser) {
    return res.status(404).json({ error: '対象ユーザーが見つかりません' });
  }
  if (targetUser.friendRequests.includes(from)) {
    return res.status(400).json({ error: '既にリクエストを送信済みです' });
  }
  targetUser.friendRequests.push(from);
  saveUsers();
  // リアルタイムで対象ユーザーに通知
  io.to(to).emit('friendRequest', { from });
  res.json({ message: '友達追加リクエストを送信しました' });
});

// ★ 友達リクエスト取得
app.get('/friendRequests', (req, res) => {
  const { username } = req.query;
  let user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json({ friendRequests: user.friendRequests });
});

// ★ 友達リクエストの応答（承認／拒否）※承認時は双方の友達リストに追加
app.post('/respondFriendRequest', (req, res) => {
  const { username, from, response } = req.body;
  let user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  const index = user.friendRequests.indexOf(from);
  if (index === -1) return res.status(400).json({ error: 'リクエストが存在しません' });
  user.friendRequests.splice(index, 1);
  if (response === 'accept') {
    if (!user.approvedFriends.includes(from)) {
      user.approvedFriends.push(from);
    }
    let fromUser = users.find(u => u.username === from);
    if (fromUser && !fromUser.approvedFriends.includes(username)) {
      fromUser.approvedFriends.push(username);
    }
    saveUsers();
    // リアルタイム更新
    io.to(username).emit('friendRequestUpdate', { approvedFriends: user.approvedFriends });
    if (fromUser) io.to(from).emit('friendRequestUpdate', { approvedFriends: fromUser.approvedFriends });
    return res.json({ message: '友達追加リクエストを承認しました' });
  } else {
    saveUsers();
    return res.json({ message: '友達追加リクエストを拒否しました' });
  }
});

// ★ 承認済み友達取得
app.get('/approvedFriends', (req, res) => {
  const { username } = req.query;
  let user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json({ approvedFriends: user.approvedFriends });
});

// ★ プロフィール更新（誕生日、ユーザー名、パスワードの変更）
app.post('/updateProfile', (req, res) => {
  const { currentUsername, newUsername, newPassword, birthday } = req.body;
  let user = users.find(u => u.username === currentUsername);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  if (newUsername && newUsername !== currentUsername && users.find(u => u.username === newUsername)) {
    return res.status(400).json({ error: '新しいユーザー名は既に使用されています' });
  }
  if (newUsername) {
    user.username = newUsername;
    // ※チャット履歴のキー更新は省略（簡易サンプル）
  }
  if (newPassword) user.password = newPassword;
  if (birthday) user.birthday = birthday;
  saveUsers();
  res.json({ message: 'プロフィールが更新されました', user });
});

// ★ チャット履歴取得（ユーザー1, ユーザー2間）
app.get('/chatHistory', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 are required' });
  const conversationKey = [user1, user2].sort().join('|');
  const history = chatHistory[conversationKey] || [];
  res.json({ chatHistory: history });
});

// ★ 既読にする：指定会話内で自分以外のメッセージを既読にする
app.post('/markAsRead', (req, res) => {
  const { user1, user2 } = req.body; // user1: 閲覧しているユーザー
  if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 are required' });
  const conversationKey = [user1, user2].sort().join('|');
  if (chatHistory[conversationKey]) {
    chatHistory[conversationKey].forEach(msg => {
      if (msg.from !== user1) msg.read = true;
    });
    saveChatHistory();
  }
  res.json({ message: 'メッセージを既読にしました' });
});

// ★ Socket.IO：リアルタイムチャットおよび各種更新
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('join', (username) => {
    socket.username = username;
    socket.join(username);
    console.log(username + ' joined room');
  });
  // プライベートメッセージ送信
  socket.on('private message', (data) => {
    console.log(`Message from ${socket.username} to ${data.to}: ${data.message}`);
    const messageObj = {
      from: socket.username,
      to: data.to,
      message: data.message,
      timestamp: new Date().toISOString(),
      read: false
    };
    // 送信先へリアルタイム送信
    io.to(data.to).emit('private message', messageObj);
    // チャット履歴に保存
    const conversationKey = [socket.username, data.to].sort().join('|');
    if (!chatHistory[conversationKey]) chatHistory[conversationKey] = [];
    chatHistory[conversationKey].push(messageObj);
    saveChatHistory();
  });
  // オプション：既読イベントの受信
  socket.on('messageRead', (data) => {
    const { conversationKey, username } = data;
    if (chatHistory[conversationKey]) {
      chatHistory[conversationKey].forEach(msg => {
        if (msg.from !== username) msg.read = true;
      });
      saveChatHistory();
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
