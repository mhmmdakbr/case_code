const express = require('express');
var router = express.Router();
const mysqlCon = require('../models/mysqlCon');


router.get('/master', (req, res) => {
    //show all from master_poin
    masterPointList(req, res)
});

router.get('/history', (req, res) => {
    //show all from master_poin
    historyPointList(req, res)
});

// list all merchant
router.post('/', (req, res) => {
    addHistoryPoin(req, res)
});

// Total Poin User
router.get('/sum', (req, res) => {
    getTotalPoinUser(req, res);
});

/*************************************** Function List **********************************************/

function masterPointList(req, res) {

    var sql = `SELECT  user_group, poin_type, poin from master_poin`;

    mysqlCon.query(sql , function (error, rows, fields) {
            if (error) {
                console.log(error)
            } else {
                res.send(rows)
            }
    });
}
function historyPointList(req, res) {

    var sql = `SELECT  * from history_poin`;

    mysqlCon.query(sql , function (error, rows, fields) {
            if (error) {
                console.log(error)
            } else {
                res.send(rows)
            }
    });
}

function addHistoryPoin(req, res) {
    const sql = `INSERT INTO history_poin 
	VALUES
	(0, 
	'${req.body.user_id}', 
	'${req.body.poin_type}', 
	NOW()
	)`;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            // after insert user get totally poin
            getTotalPoinUser(req, res)
        }
    });

}

function getTotalPoinUser(req, res) {
    const sql = `SELECT b.user_id, SUM(a.poin) AS total FROM master_poin a INNER JOIN history_poin b ON a.poin_type = b.poin_type
    WHERE b.user_id = '${req.body.user_id}'`;
                                        console.log(sql);
    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

module.exports = router;