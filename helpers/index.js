const { Sequelize } = require('sequelize');
const db = require('../db');
const models = require('../models');
const rooms = { //Global rooms object
  test: []
}

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

const addTrack = async (ws) => {
  const t = await db.transaction();

  try {
    const queryTracks = await db.query(`SELECT COUNT(*), s.id AS "sceneId" FROM rooms AS r JOIN scenes AS s ON s."roomId" = r.id JOIN tracks AS t ON t."sceneId" = s.id WHERE r.name = '${ws.room}' AND s.num = 0 GROUP BY r.id, s.id`, { type: Sequelize.QueryTypes.SELECT, transaction: t });
    const trackAmount = queryTracks[0].count;
    const sceneId = queryTracks[0].sceneId

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
  sendToRoom,
  sendToRoomAll,
  addTrack,
  deleteTrack
}
