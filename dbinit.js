require('dotenv-flow').config();
const { Sequelize } = require('sequelize');
let db = require('./db');
const models = require('./models');

models.sequelize.sync().then(async () => {
  const t = await db.transaction();

  try {
    await db.query(`INSERT INTO rooms (name, "createdAt", "updatedAt") VALUES ('test', NOW(), NOW())`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
    await db.query(`INSERT INTO scenes ("createdAt", "updatedAt", "roomId") VALUES (NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
    await db.query(`INSERT INTO scenes ("createdAt", "updatedAt", "roomId") VALUES (NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
    await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('kick', 'https://postead.s3.eu-west-2.amazonaws.com/kick.wav', ARRAY [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
    await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('hh', 'https://postead.s3.eu-west-2.amazonaws.com/hh.wav', ARRAY [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
    await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('hh', 'https://postead.s3.eu-west-2.amazonaws.com/hh.wav', ARRAY [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], NOW(), NOW(), 2)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
    await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('hh', 'https://postead.s3.eu-west-2.amazonaws.com/hh.wav', ARRAY [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], NOW(), NOW(), 2)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
    await t.commit();
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}).catch(err => {
  console.error(err);
});
