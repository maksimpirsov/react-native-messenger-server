const WebSocket = require('ws');
const uuidv1 = require('uuid/v1');

const wss = new WebSocket.Server({
  port: 8080,
  perMessageDeflate: {
    zlibDeflateOptions: { // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    clientMaxWindowBits: 10,       // Defaults to negotiated value.
    serverMaxWindowBits: 10,       // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10,          // Limits zlib concurrency for perf.
    threshold: 1024,               // Size (in bytes) below which messages
                                   // should not be compressed.
  }
});

var clients = [];

wss.on('connection', function connection(ws, req) {

  var sessionId = req.headers['sec-websocket-key'];
  console.log('New connection id :: ', sessionId);

  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
    var msg = JSON.parse(message);
    switch (msg.cmd) {
      case 'request-login':
        clients.push({
          sessionId: sessionId,
          username: msg.username,
          socket: ws,
        });
        var data = {
          cmd: 'login-suceeded',
          sessionId: sessionId,
        };
        ws.send(JSON.stringify(data));
        sendBroadcast(sessionId, {
          cmd: 'someone-entered',
          sessionId: sessionId,
          username: msg.username,
        });
        break;
      case 'request-logout':
        logout(ws);
        break;
      case 'request-rename':
        if (clients[msg.sessionId]) {
          clients[msg.sessionId].username = msg.username;
          sendBroadcast(msg.sessionId, {
            cmd: 'someone-renamed',
            sessionId: msg.sessionId,
            username: msg.username,
          });
        }
        break;
      case 'fetch-clients':
        var data = {
          cmd: 'clients-arrived',
          clients: getClients(msg.sessionId),
        };
        ws.send(JSON.stringify(data));
        break;
      case 'send-text':
        var data = {
          cmd: 'send-text',
          receiver: msg.receiver,
          text: msg.text,
          time: Date.now(),
        };
        ws.send(JSON.stringify(data));
        sendText(msg.sessionId, msg.receiver, msg.text, data.time);
        break;
    }
  });

  ws.on('error', function error(err) {
    console.log('error occurred :: ', err.message);
  });

  ws.on('close', function close(code, reason) {
    console.log('disconnected :: ', reason);
    logout(ws);
  });

  // ws.send('something');
});

function getClients(excluder) {
  var result = [];
  for (var i = 0; i < clients.length; i++) {
    if (clients[i].sessionId == excluder)
      continue;
    result.push({
      sessionId: clients[i].sessionId,
      username: clients[i].username,
    });
  }
  return result;
}

function sendBroadcast(sender, data) {
  for (var i = 0; i < clients.length; i++) {
    if (clients[i].sessionId == sender)
      continue;
    clients[i].socket.send(JSON.stringify(data));
  }
}

function sendText(sender, receiver, text, time) {
  for (var i = 0; i < clients.length; i++) {
    if (clients[i].sessionId == receiver) {
      var data = {
        cmd: 'receive-text',
        sender: sender,
        text: text,
        time: time,
      };
      clients[i].socket.send(JSON.stringify(data));
      return true;
    }
  }
  return false;
}

function logout(ws) {
  var sender = getSessionId(ws);
  if (sender !== false) {
    sendBroadcast(sender, {
      cmd: 'someone-left',
      sessionId: sender,
    });
    delete clients[sender];
  }
}

function getSessionId(ws) {
  for (var i = 0; i < clients.length; i++) {
    if (clients[i].socket == ws)
      return clients[i].sessionId;
  }
  return false;
}
