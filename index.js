const WebSocket = require('ws');
const PORT = 8080;
const rooms = { //Global rooms object
  test: []
}

const wss = new WebSocket.Server({ port: PORT  });

wss.on('connection', function connection(ws, req) {
  if (req.url === '/test') {
    // Add client to room
    rooms.test.push(ws);

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

  ws.on('message', function incoming(_message) {
    const message = JSON.parse(_message);

    if (message.type === 'SEQ_BUTTON_PRESS') {
      for (const socket of rooms.test) {
        if (socket !== ws) {
          socket.send(JSON.stringify({
            type: 'SEQ_BUTTON_PRESS',
            trackName: message.trackName,
            position: message.position
          }));
        }
      }
    }
  });

  ws.on('close', () => {
    rooms.test.splice(rooms.test.indexOf(ws), 1);
  })
});

wss.on('listening', () => {
  console.log('Server is listening on port ' + PORT + '.');
})
