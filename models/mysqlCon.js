var mysql = require('mysql');

//- Connection configuration
var con  = mysql.createPool({
  connectionLimit : 10,
  host: "35.247.172.123",
  port: "3306",
  user: "root",
  password: "Immsp4102",
  database: "rekonsil",
  multipleStatements: true
});


module.exports = con;