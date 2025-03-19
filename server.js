const express = require('express');
const app = express();
const http = require('http').createServer(app);
const socketio = require('socket.io');
const io = socketio(http);
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

// 永続データの初期化（data.json が存在すれば読み込む）
let data = { users: [], chatHistory: {} };
if (fs.existsSync(DATA_FILE)) {
  try {
    const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
    data = JSON.parse(fileContent);
  } catch (err) {
    console.error('Error reading data.json:', err);
  }
} else {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.use(express.json());
// 静的ファイル（index.html, style.css, script.js）を提供
app.use(express.static(__dirname));

// ヘルパー：データの確実な保存（同期的に書き込み）
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// API エンドポイント

// ユーザー登録：新規ユーザーの情報（ユーザー名、パスワード、誕生日、友達リストなど）を data.json に追加
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (data.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'ユーザー名は既に存在します' });
  }
  const newUser = { username, password, birthday: null, approvedFriends: [], friendRequests: [] };
  data.users.push(newUser);
  saveData();
  res.json({ message: '登録成功', user: newUser });
});

// ログイン：登録済みユーザーの認証
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = data.users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: '認証失敗' });
  }
  res.json({ message: 'ログイン成功', user });
});

// ユーザー一覧取得（ログインユーザー以外）
app.get('/users', (req, res) => {
  const { username } = req.query;
  const userList = data.users.filter(u => u.username !== username).map(u => u.username);
  res.json({ users: userList });
});

// 友達追加リクエスト送信：対象ユーザーの friendRequests 配列に追加し、data.json を更新
app.post('/sendFriendRequest', (req, res) => {
  const { from, to } = req.body;
  const target = data.users.find(u => u.username === to);
  if (!target) {
    return res.status(404).json({ error: '対象ユーザーが見つかりません' });
  }
  if (target.friendRequests.includes(from)) {
    return res.status(400).json({ error: '既にリクエストを送信済みです' });
  }
  target.friendRequests.push(from);
  saveData();
  res.json({ message: '友達追加リクエストを送信しました' });
  // リアルタイム通知：対象ユーザーに送信
  io.to(to).emit('friendRequest', { from });
});

// 友達リクエスト取得
app.get('/friendRequests', (req, res) => {
  const { username } = req.query;
  const user = data.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json({ friendRequests: user.friendRequests });
});

// 友達リクエスト応答（承認／拒否）：応答後、両者の approvedFriends 配列に反映し、data.json を更新
app.post('/respondFriendRequest', (req, res) => {
  const { username, from, response } = req.body;
  const user = data.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  const index = user.friendRequests.indexOf(from);
  if (index === -1) return res.status(400).json({ error: 'リクエストが存在しません' });
  user.friendRequests.splice(index, 1);
  let replyMsg = '';
  if (response === 'accept') {
    if (!user.approvedFriends.includes(from)) {
      user.approvedFriends.push(from);
    }
    const fromUser = data.users.find(u => u.username === from);
    if (fromUser && !fromUser.approvedFriends.includes(username)) {
      fromUser.approvedFriends.push(username);
    }
    replyMsg = '友達追加リクエストを承認しました';
    res.json({ message: replyMsg });
  } else {
    replyMsg = '友達追加リクエストを拒否しました';
    res.json({ message: replyMsg });
  }
  saveData();
  // リアルタイム更新：更新イベントを両者へ通知
  io.to(username).emit('updateFriendList');
  io.to(from).emit('updateFriendList');
});

// 承認済み友達一覧取得
app.get('/approvedFriends', (req, res) => {
  const { username } = req.query;
  const user = data.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json({ approvedFriends: user.approvedFriends });
});

// ユーザー情報更新（設定）：誕生日、ユーザー名、パスワードの変更を data.json に保存
app.post('/updateUser', (req, res) => {
  const { username, newUsername, newPassword, birthday } = req.body;
  const user = data.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  if (newUsername) user.username = newUsername;
  if (newPassword) user.password = newPassword;
  if (birthday) user.birthday = birthday;
  saveData();
  res.json({ message: 'ユーザー情報を更新しました', user });
});

// チャット履歴取得：user1 と user2 の会話履歴を data.json から返す
app.get('/chatHistory', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 are required' });
  const convKey = [user1, user2].sort().join('|');
  const history = data.chatHistory[convKey] || [];
  res.json({ chatHistory: history });
});

// Socket.IO によるリアルタイム通信
io.on('connection', (socket) => {
  console.log('A user connected');
  
  // ユーザー名でルームに参加
  socket.on('join', (username) => {
    socket.username = username;
    socket.join(username);
    console.log(username + ' joined their room');
  });
  
  // プライベートメッセージ送信（送信者は自分側に表示済みなのでエコーは行わない）
  socket.on('private message', (msgData) => {
    const msgObj = {
      id: Date.now() + '-' + Math.floor(Math.random() * 1000),
      from: socket.username,
      to: msgData.to,
      message: msgData.message,
      timestamp: new Date().toISOString(),
      read: false,
      replyTo: msgData.replyTo || null
    };
    io.to(msgData.to).emit('private message', msgObj);
    // 永続チャット履歴に保存
    const convKey = [socket.username, msgData.to].sort().join('|');
    if (!data.chatHistory[convKey]) {
      data.chatHistory[convKey] = [];
    }
    data.chatHistory[convKey].push(msgObj);
    saveData();
  });
  
  // 既読処理：チャット画面が開いている場合、相手からの未読メッセージを既読に更新
  socket.on('markRead', (info) => {
    const convKey = [info.user1, info.user2].sort().join('|');
    if (data.chatHistory[convKey]) {
      const updatedIds = [];
      data.chatHistory[convKey] = data.chatHistory[convKey].map(msg => {
        if (msg.from === info.user2 && !msg.read) {
          msg.read = true;
          updatedIds.push(msg.id);
        }
        return msg;
      });
      saveData();
      // 既読通知を送信（送信側に更新を通知）
      io.to(info.user2).emit('readReceipt', { messageIds: updatedIds });
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
