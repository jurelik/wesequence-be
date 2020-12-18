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
      track.belongsTo(models.scene);
    }
  };
  track.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false
    },
    sequence: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'track',
  });
  return track;
};
