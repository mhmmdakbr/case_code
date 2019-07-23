var mysql = require('mysql');

var con = mysql.createConnection({
  host: "10.1.10.20",
  port: "3306",
  user: "root",
  password: "Immsp4102",
  database: "rekonsiliasi"
});

con.connect(function (err){
    if(err) throw err;
});

module.exports = con;