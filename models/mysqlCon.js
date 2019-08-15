var mysql = require('mysql');

var con = mysql.createConnection({
  host: "35.226.239.172",
  port: "3306",
  user: "root",
  password: "Immsp4102",
  database: "rekonsil"
});

con.connect(function (err){
    if(err) throw err;
});

module.exports = con;