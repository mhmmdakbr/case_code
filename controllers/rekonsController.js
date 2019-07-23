const express = require('express');
var router = express.Router();
const mysqlCon = require('../models/mysqlCon');
const Excel = require('exceljs')


/// ini untuk upload ///
const multer = require('multer');
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './tmp/csv');
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
var upload = multer({ storage: storage })
///                 ///


//upload and convert csv & xlxs
router.post('/upload', upload.single('file'), (req, res) => {
    convertCsv(req, res)
});

//show data summary sesuai semua data yg pertama dimunculkan
router.get('/get/datasummary/:attachment_id', (req, res) => {
    getDataSummary(req, res)
});

//show data semua sesuai attachment yg dipilih
router.get('/get/databyattachment/:attachment_id', (req, res) => {
    getAllData(req, res)
});

// update point user
router.post('/', (req, res) => {
    /* post body
       {
         "user_id": "nanto",
         "poin_type": "openApp"
       }
    */
    addHistoryPoin(req, res)
});

// get total poin user 
router.get('/sum', (req, res) => {
    /* post body 

     {"user_id" : "nanto"}

    */
    getTotalPoinUser(req, res);
});

/*************************************** Function List **********************************************/

async function convertCsv(req, res) {

    var id_attachment = 0

    //insert attachment to DB and get bind_id
    await mysqlCon.query(`
                        INSERT INTO attachment ( 
                            attachment_name , import_at , ext_name 
                          ) values ( 
                            '${req.file.filename}' , NOW() , '${req.file.mimetype}'
                          )`, async function (error, rows, fields) {
            if (error) {
                console.log(error)
            } else {
                id_attachment = rows.insertId
                var count = 0;
                var array = []
                var workbook = new Excel.Workbook()
                console.log("type : ", req.file.mimetype)
                if (req.file.mimetype.includes("spreadsheet")) {

                    //convert excel to object and push to array
                    await workbook.xlsx.readFile(req.file.path)
                        .then(workbook => {

                            workbook.eachSheet((sheet, id) => {
                                sheet.eachRow((row, rowIndex) => {
                                    console.log(row.values, rowIndex)
                                    if (row.values.includes("OVO", 4)) {
                                        mysqlCon.query(`
                    INSERT INTO transaksi ( 
                    merchant_id , merchant_name , channel ,   
                    transaction_id , reference_id , tgl_transaksi , 
                      tgl_pembayaran , amount , total_amount ,
                      attachment_id , customer_email ,  customer_name ,
                      status
                  ) values ( 
                      ${parseInt(row.values[2])} , '${row.values[3]}' , '${row.values[4]}' , 
                      ${parseInt(row.values[5])} , ${parseInt(row.values[6])} ,CAST('${row.values[11]}' AS datetime) ,  
                      CAST('${row.values[12]}' AS datetime) , ${parseInt(row.values[13])} , ${parseInt(row.values[14])} , 
                      ${id_attachment} , '${row.values[9]}' , '${row.values[8]}' , 
                      '${row.values[15]}' 
                  )`, async function (error, rows, fields) {
                                                if (error) {
                                                    console.log(error)
                                                    res.status(400).send('Oops, something happens')
                                                } else {
                                                    count++
                                                }
                                            });
                                        count++
                                    }
                                })
                            })
                            res.send(`data : ${count}`)
                        })





                } else if (req.file.mimetype.includes("csv")) {

                    await workbook.csv.readFile(req.file.path)
                        .then(worksheet => {
                            worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
                                console.log("Row " + rowNumber + " = " + row.values)
                                if (row.values.includes("OVO", 4)) {
                                    mysqlCon.query(`
                INSERT INTO transaksi ( 
                merchant_id , merchant_name , channel ,   
                transaction_id , reference_id , tgl_transaksi , 
                  tgl_pembayaran , amount , total_amount ,
                  attachment_id , customer_email ,  customer_name ,
                  status
              ) values ( 
                  ${row.values[2]} , '${row.values[3]}' , '${row.values[4]}' , 
                  ${row.values[5]} , ${row.values[6]} , '${row.values[11]}',  
                  '${row.values[12]}' , ${row.values[13]} , ${row.values[14]} , 
                  ${id_attachment} , '${row.values[9]}' , '${row.values[8]}' , 
                  '${row.values[15]}' 
              )`, async function (error, rows, fields) {
                                            if (error) {
                                                console.log(error)
                                                res.status(400).send('Oops, something happens')
                                            } else {
                                                count++
                                            }
                                        });
                                    count++
                                }
                            });
                        res.send(`data : ${count}`)   
                        });


                } else {
                    res.send("file bukan csv atau xlsx")
                }
            }
        });





}

function getAllData(req, res) {

    var sql = `SELECT  * from history_poin`;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

function getDataSummary(req, res) {

    var sql = `SELECT  * from history_poin`;

    mysqlCon.query(sql, function (error, rows, fields) {
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