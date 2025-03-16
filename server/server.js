const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.json());

app.use(express.static(path.join(__dirname, '../public')));

// --- 永続化用ファイルパスの設定 ---
const chatHistoryFile = path.join(__dirname, 'chatHistory.json');
const usersFile = path.join(__dirname, 'users.json');

// --- 起動時にファイルからデータを読み込む ---
let chatHistory = {};
if (fs.existsSync(chatHistoryFile)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(chatHistoryFile, 'utf8'));
  } catch (e) {
    console.error('Error reading chatHistory file:', e);
    chatHistory = {};
  }
}

let users = [];
if (fs.existsSync(usersFile)) {
  try {
    users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  } catch (e) {
    console.error('Error reading users file:', e);
    users = [];
  }
}

// --- ユーザー登録 ---
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'ユーザー名は既に存在します' });
  }
  let newUser = { username, password, approvedFriends: [], friendRequests: [], birthday: null };
  users.push(newUser);
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  res.json({ message: '登録成功', user: newUser });
});

// --- ログイン ---
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  let user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: '認証失敗' });
  }
  res.json({ message: 'ログイン成功', user });
});

// --- ユーザー一覧取得（ログインユーザー除く） ---
app.get('/users', (req, res) => {
  const { username } = req.query;
  const filtered = users.filter(u => u.username !== username).map(u => u.username);
  res.json({ users: filtered });
});

// --- 友達追加リクエスト送信 ---
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
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  res.json({ message: '友達追加リクエストを送信しました' });
  io.to(to).emit('friendRequest', { from });
});

// --- 友達リクエスト取得 ---
app.get('/friendRequests', (req, res) => {
  const { username } = req.query;
  let user = users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }
  res.json({ friendRequests: user.friendRequests });
});

// --- 友達リクエスト応答 ---
app.post('/respondFriendRequest', (req, res) => {
  const { username, from, response } = req.body;
  let user = users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }
  const index = user.friendRequests.indexOf(from);
  if (index === -1) {
    return res.status(400).json({ error: 'リクエストが存在しません' });
  }
  user.friendRequests.splice(index, 1);
  if (response === 'accept') {
    if (!user.approvedFriends.includes(from)) {
      user.approvedFriends.push(from);
    }
    let fromUser = users.find(u => u.username === from);
    if (fromUser && !fromUser.approvedFriends.includes(username)) {
      fromUser.approvedFriends.push(username);
    }
    res.json({ message: '友達追加リクエストを承認しました' });
  } else {
    res.json({ message: '友達追加リクエストを拒否しました' });
  }
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
});

// --- 承認済み友達一覧取得 ---
app.get('/approvedFriends', (req, res) => {
  const { username } = req.query;
  let user = users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }
  res.json({ approvedFriends: user.approvedFriends });
});

// --- ユーザー情報更新（設定） ---
app.post('/updateUser', (req, res) => {
  const { username, newUsername, newPassword, birthday } = req.body;
  let user = users.find(u => u.username === username);
  if(!user) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }
  if(newUsername) user.username = newUsername;
  if(newPassword) user.password = newPassword;
  if(birthday) user.birthday = birthday;
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  res.json({ message: 'ユーザー情報を更新しました', user });
});

// --- チャット履歴取得 ---
app.get('/chatHistory', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) {
    return res.status(400).json({ error: 'user1 and user2 are required' });
  }
  const conversationKey = [user1, user2].sort().join('|');
  const history = chatHistory[conversationKey] || [];
  res.json({ chatHistory: history });
});

// --- Socket.IO によるリアルタイムチャット処理 ---
io.on('connection', (socket) => {
  console.log('a user connected');
  
  // ユーザー名を受け取り、そのユーザー専用のルームに参加
  socket.on('join', (username) => {
    socket.username = username;
    socket.join(username);
    console.log(username + ' joined their room');
  });
  
  // プライベートメッセージ送信
  socket.on('private message', (data) => {
    const msgObj = {
      id: Date.now() + '-' + Math.floor(Math.random() * 1000),
      from: socket.username,
      to: data.to,
      message: data.message,
      timestamp: new Date().toISOString(),
      read: false
    };
    // 送信相手へ
    io.to(data.to).emit('private message', msgObj);
    // 自分にも表示
    socket.emit('private message', msgObj);
    
    const conversationKey = [socket.username, data.to].sort().join('|');
    if (!chatHistory[conversationKey]) {
      chatHistory[conversationKey] = [];
    }
    chatHistory[conversationKey].push(msgObj);
    fs.writeFile(chatHistoryFile, JSON.stringify(chatHistory, null, 2), (err) => {
      if (err) console.error('Error saving chat history:', err);
    });
  });
  
  // 既読処理
  socket.on('markRead', (data) => {
    const conversationKey = [data.user1, data.user2].sort().join('|');
    if(chatHistory[conversationKey]) {
      let updatedMessageIds = [];
      chatHistory[conversationKey] = chatHistory[conversationKey].map(msg => {
        if(msg.from === data.user2 && !msg.read) {
          msg.read = true;
          updatedMessageIds.push(msg.id);
        }
        return msg;
      });
      fs.writeFile(chatHistoryFile, JSON.stringify(chatHistory, null, 2), (err) => {
        if (err) console.error('Error saving chat history:', err);
      });
      io.to(data.user2).emit('readReceipt', { conversationKey, messageIds: updatedMessageIds });
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
