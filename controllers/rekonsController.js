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

router.get('/get/allattachment', (req, res) => {
    getAllAttachment(req, res)
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
                    INSERT INTO transaction ( 
                    merchant_id , merchant_name , channel ,   
                    transaction_id , reference_id , tgl_transaksi , 
                      tgl_pembayaran , amount , total_amount ,
                      attachment_id , customer_email ,  customer_name ,
                      status
                  ) values ( 
                      ${parseInt(row.values[2])} , '${row.values[3]}' , '${row.values[4]}' , 
                      '${row.values[5]}' , '${row.values[7]}' , CAST('${row.values[11]}' AS datetime) ,  
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

function getAllAttachment(req, res) {

    var sql = `SELECT  * from attachment `;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

function getAllData(req, res) {

    var sql = `SELECT  * from trx tr
    INNER JOIN transaction tx ON tr.ref_id = tx.reference_id
    INNER JOIN ustadz ut ON tr.id_ustadz = ut.id_ustadz
    INNER JOIN masjid ms ON tr.id_masjid = ms.id_masjid
    INNER JOIN bank ba ON tr.id_bank = ba.bank_id
    WHERE tx.attachment_id = ${req.params.attachment_id}`;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

function getDataSummary(req, res) {
    const sql = `SELECT tr.tgl_transaksi, ba.nama_bank, count(tx.id_bank) as jumlah_transaksi, SUM(tr.total_amount) as nominal_transaksi
    FROM trx tx
    INNER JOIN transaction tr ON tx.ref_id = tr.reference_id 
    INNER JOIN bank ba ON tx.id_bank = ba.bank_id
    WHERE tr.attachment_id = ${req.params.attachment_id}
    GROUP BY tr.tgl_transaksi, ba.nama_bank 
    ORDER BY tr.tgl_transaksi`;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });

}

module.exports = router;