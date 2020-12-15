const WebSocket = require('ws');
const PORT = 8080;

const wss = new WebSocket.Server({ port: PORT  });

wss.on('connection', function connection(ws, req) {
  if (req.url === '/test') {
    ws.send(JSON.stringify({
      type: 'init',
      scenes: [ [{
        name: 'kick',
        url: 'https://postead.s3.eu-west-2.amazonaws.com/kick.wav',
        sequence: [ 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0 ]
      }, {
        name: 'hh',
        url: 'https://postead.s3.eu-west-2.amazonaws.com/hh.wav',
        sequence: [ 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0 ]
      }] ]
    }));
  }
  else {
    ws.send(JSON.stringify({
      type: 'init',
      scenes: []
    }));
  }
  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });
});

wss.on('listening', () => {
  console.log('Server is listening on port ' + PORT + '.');
})
