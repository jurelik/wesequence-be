'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class track extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      track.belongsTo(models.scene, { onDelete: 'CASCADE' });
    }
  };
  track.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    url: {
      type: DataTypes.STRING
    },
    sequence: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: false,
      defaultValue: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    gain: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100
    }
  }, {
    sequelize,
    modelName: 'track',
  });
  return track;
};
