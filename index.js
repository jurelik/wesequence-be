require('dotenv-flow').config();
const WebSocket = require('ws');
const { Sequelize } = require('sequelize');
const models = require('./models');

const rooms = { //Global rooms object
  test: []
}

const wss = new WebSocket.Server({ port: process.env.PORT  });
const db = new Sequelize(`postgres://${process.env.DB_USER}@${process.env.DB_URL}:5432/${process.env.DB_NAME}`)

models.sequelize.sync().then(() => {
  console.log('sync success')
}).catch(err => {
  console.error(err);
})

//db.authenticate().then(() => {
//  console.log('Connection has been established successfully.');
//}).catch(error => {
//  console.error('Unable to connect to the database:', error);
//})

//Helper functions
const sendToRoom = (payload, ws) => {
  for (const socket of rooms[ws.room]) {
    if (socket !== ws) {
      socket.send(JSON.stringify(payload));
    }
  }
}

wss.on('connection', function connection(ws, req) {
  if (req.url === '/test') {
    // Add client to room & room to client
    rooms.test.push(ws);
    ws.room = req.url.substr(1);

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

  ws.on('message', function incoming(_data) {
    const data = JSON.parse(_data);

    switch (data.type) {
      case 'SEQ_BUTTON_PRESS':
        sendToRoom({
          type: 'SEQ_BUTTON_PRESS',
          trackName: data.trackName,
          position: data.position
        }, ws);
        break;
      case 'CHANGE_TEMPO':
        sendToRoom({
          type: 'CHANGE_TEMPO',
          tempo: data.tempo
        }, ws);
        break;
      default:
        return null;
    }
  });

  ws.on('close', () => {
    rooms.test.splice(rooms.test.indexOf(ws), 1);
  })
});

wss.on('listening', () => {
  console.log('Server is listening on port ' + process.env.PORT + '.');
})
