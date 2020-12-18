require('dotenv-flow').config();

module.exports = {
  "development": {
    "username": process.env.DB_USER,
    "password": null,
    "database": process.env.DB_NAME,
    "host": process.env.DB_URL,
    "dialect": "postgres"
  },
  "test": {
    "username": process.env.DB_USER,
    "password": null,
    "database": process.env.DB_NAME,
    "host": process.env.DB_URL,
    "dialect": "postgres"
  },
  "production": {
    "username": process.env.DB_USER,
    "password": null,
    "database": process.env.DB_NAME,
    "host": process.env.DB_URL,
    "dialect": "postgres"
  }
}
