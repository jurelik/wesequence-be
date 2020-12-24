const { Sequelize } = require('sequelize');
const { S3, PutObjectCommand } = require('@aws-sdk/client-s3');
const { nanoid } = require('nanoid');
const fs = require('fs');
const db = require('../db');
const models = require('../models');
const rooms = { //Global rooms object
  test: []
}

//Init connection to AWS S3
const REGION = 'eu-west-2';
const s3 = new S3({ region: REGION });

const dbINIT = () => {
  models.sequelize.sync().then(async () => {
    const t = await db.transaction();

    try {
      await db.query(`INSERT INTO rooms (name, "createdAt", "updatedAt") VALUES ('test', NOW(), NOW())`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO scenes (num, "createdAt", "updatedAt", "roomId") VALUES (0, NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('kick', 'https://postead.s3.eu-west-2.amazonaws.com/kick.wav', ARRAY [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('hh', 'https://postead.s3.eu-west-2.amazonaws.com/hh.wav', ARRAY [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await t.commit();
    }
    catch (err) {
      await t.rollback();
      console.log(err);
    }
  }).catch(err => {
    console.error(err);
  });
}

// Taken from: https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
const stringToArraybuffer = (str) => {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);

  for (var i=0, strLen=str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }

  return buf;
}

const sendToRoom = (payload, ws) => {
  for (const socket of rooms[ws.room]) {
    if (socket !== ws) {
      socket.send(JSON.stringify(payload));
    }
  }
}

const sendToRoomAll = (payload, ws) => {
  for (const socket of rooms[ws.room]) {
    socket.send(JSON.stringify(payload));
  }
}

const changeTempo = async (tempo, ws) => {
  const t = await db.transaction();

  try {
    //Make sure tempo is above 50
    tempo = tempo < 50 ? 50 : tempo;

    //Update db
    await db.query(`UPDATE rooms SET tempo = ${tempo} WHERE name = '${ws.room}'`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
    await t.commit();

    //Send to other sockets in room
    sendToRoom({
      type: 'CHANGE_TEMPO',
      tempo
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }

}

const changeSound = async (data, ws) => {
  const t = await db.transaction();

  try {
    const arraybuffer = stringToArraybuffer(data.arraybuffer);
    const key = `${nanoid()}.wav`;
    const bucketName = 'postead'

    //Upload to s3
    const uploadFile = await s3.send(new PutObjectCommand({ Bucket: 'postead', Key: key, Body: arraybuffer }));
    const fileURL = `https://${bucketName}.s3-${REGION}.amazonaws.com/${key}`;

    //Update db
    await db.query(`UPDATE tracks SET url = '${fileURL}' WHERE id = ${data.trackId}`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
    await t.commit();

    //Send to other sockets in room
    sendToRoom({
      type: 'CHANGE_SOUND',
      trackId: data.trackId,
      arraybuffer: data.arraybuffer
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}

const seqButtonPress = async (trackId, position, ws) => {
  const t = await db.transaction();
  try {
    await db.query(`UPDATE tracks SET sequence[${position + 1}] = CASE WHEN sequence[${position + 1}] = 0 THEN 1 ELSE 0 END WHERE id = ${trackId}`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
    await t.commit();

    sendToRoom({
      type: 'SEQ_BUTTON_PRESS',
      trackId,
      position
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}

const addTrack = async (ws) => {
  const t = await db.transaction();

  try {
    const queryTracks = await db.query(`SELECT COUNT(t.id), s.id AS "sceneId" FROM rooms AS r JOIN scenes AS s ON s."roomId" = r.id LEFT JOIN tracks AS t ON t."sceneId" = s.id WHERE r.name = '${ws.room}' AND s.num = 0 GROUP BY r.id, s.id`, { type: Sequelize.QueryTypes.SELECT, transaction: t });
    console.log(queryTracks);
    const trackAmount = queryTracks[0].count;
    const sceneId = queryTracks[0].sceneId

    //BE CAREFUL - postgres uses one based arrays!
    const newTrackQuery = await db.query(`INSERT INTO tracks (name, "createdAt", "updatedAt", "sceneId") VALUES ('Track ${trackAmount + 1}', NOW(), NOW(), ${sceneId}) RETURNING id AS "trackId", name AS "trackName" `, { type: Sequelize.QueryTypes.INSERT, transaction: t });
    const newTrack = newTrackQuery[0][0];

    await t.commit();

    sendToRoomAll({
      type: 'ADD_TRACK',
      trackId: newTrack.trackId,
      trackName: newTrack.trackName
    }, ws)
  }
  catch (err) {
    await t.rollback();
    console.log(err)
  }
}

const deleteTrack = async (trackId, ws) => {
  const t = await db.transaction();

  try {
    await db.query(`DELETE FROM tracks WHERE id = ${trackId}`, { type: Sequelize.QueryTypes.DELETE, transaction: t });
    await t.commit();

    sendToRoom({
      type: 'DELETE_TRACK',
      trackId: trackId
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}

module.exports = {
  rooms,
  dbINIT,
  stringToArraybuffer,
  sendToRoom,
  sendToRoomAll,
  changeTempo,
  changeSound,
  seqButtonPress,
  addTrack,
  deleteTrack
}
