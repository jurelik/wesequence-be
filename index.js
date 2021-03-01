require('dotenv-flow').config();
const express = require('express');
var cors = require('cors');
const app = express();
const WebSocket = require('ws');
const { Sequelize } = require('sequelize');
let db = require('./db');
const helpers = require('./helpers');

//helpers.dbINIT(); //Uncomment only when initialising db locally

const server = app.listen(process.env.PORT, () => {
  console.log('Server is listening on port ' + process.env.PORT + '.');
});

const wss = new WebSocket.Server({ server, path: '/ws' });

//Rewrite of the ws shouldHandle logic to handle a custom path with rooms after
WebSocket.Server.prototype.shouldHandle = function shouldHandle(req) {
  if (req.url.startsWith(this.options.path)) {
    //Delete the path portion of the url
    req.url = req.url.substr(this.options.path.length);
    return true;
  }

  return false;
}

app.use(cors());

app.get('/api/create', (req, res) => {
  helpers.createRoom(req, res);
});

app.get('/', (req, res) => {
  res.end('Hello there, fancy seeing you here!');
});

app.get('/api/download/:room', async (req, res) => {
  helpers.handleDownload(req, res);
});

wss.on('connection', async (ws, req) => {
  await helpers.handleConnection(ws, req);

  ws.on('message', (_data) => {
    const data = JSON.parse(_data);

    switch (data.type) {
      case 'pong':
        ws.isAlive = true;
        break;
      case 'SEQ_BUTTON_PRESS':
        helpers.seqButtonPress(data, ws);
        break;
      case 'CHANGE_TEMPO':
        helpers.changeTempo(data.tempo, ws);
        break;
      case 'CHANGE_SOUND':
        helpers.changeSound(data, ws);
        break;
      case 'CHANGE_GAIN':
        helpers.changeGain(data, ws);
        break;
      case 'ADD_TRACK':
        helpers.addTrack(data, ws);
        break;
      case 'DELETE_TRACK':
        helpers.deleteTrack(data, ws);
        break;
      case 'CHANGE_TRACK_NAME':
        helpers.changeTrackName(data, ws);
        break;
      case 'ADD_SCENE':
        helpers.addScene(ws);
        break;
      case 'DELETE_SCENE':
        helpers.deleteScene(data, ws);
        break;
      case 'DUPLICATE_SCENE':
        helpers.duplicateScene(data, ws);
        break;
      case 'CHANGE_SCENE_NAME':
        helpers.changeSceneName(data, ws);
        break;
      default:
        return null;
    }
  });

  ws.on('close', () => {
    helpers.closeConnection(ws);
  });
});

//Keep connection alive because Heroku automatically terminates a connection after 55 seconds
//Check if the connection is still alive in the process and close if not
const interval = setInterval(() => {
  for (const room in helpers.rooms) {
    helpers.rooms[room].forEach(ws => {
      if (!ws.isAlive) {
        ws.close();
        return helpers.closeConnection(ws);
      }

      ws.isAlive = false;
      ws.send(JSON.stringify({
        type: 'ping'
      }));
    })
  }
}, 30000)

wss.on('close', () => {
  clearInterval(interval);
})
