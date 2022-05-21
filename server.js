const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const crypto = require('crypto');
var cors = require('cors');
const fs = require('fs');
const fileupload = require('express-fileupload');
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
});

const app = express();
const PORT = 5001;
const MIN_UID = 1;
const MAX_UID = 999999;
const dbDetailsPath = './db_details.json';
const whitelist = [ 'http://localhost:5000' ];
const adminPhonenum = [ 9930792976 ];
const adminEmail = [ "ishaanbose2000@gmail.com" ];

let conn = null;

/**
 * 
 * @param {mysql.RowDataPacket[]} resultSet 
 * @param {int} max 
 * @param {int} min 
 * @returns Array containing unique ID and a unique salt value
 */
function generateUniqueIDAndSalt(resultSet, max, min) {
    var id = Math.floor(Math.random() * (max - min + 1)) + min;
    var idArray = [], saltArray = [];

    for (var i = 0; i < resultSet.length; i++) {
        idArray.push(resultSet[i].uid);
        saltArray.push(resultSet[i].salt_value);
    }

    while (idArray.includes(id)) {
        id = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    var salt = crypto.randomBytes(16).toString('base64');

    while (saltArray.includes(salt)) {
        salt = crypto.randomBytes(16).toString('base64');
    }

    return [ id, salt ];
}

function registerGeneral(conn, data, callback) {
    conn.query(`insert into general_user values (${ data.uid }, "${ data.fname }", 
        "${ data.mname }", "${ data.lname }"`, (err, result) => {
            callback(err);
        });
}

function registerLocalBusiness(conn, data, callback) {
    conn.query(`insert into local_business values (${ data.uid }, "${ data.address_line1 }", "${ data.address_line2 }",
        "${ data.address_line3 }", "${ data.pincode }", "${ data.business_name }", "${ data.aadhaar_num }")`, (err, result) => {
            callback(err);
        });
}

app.use(bodyParser.json());
app.use(fileupload({ createParentPath: true }));
app.use(cors({
    origin: (origin, callback) => {
        console.log('Origin:', origin);
        if (whitelist.includes(origin) || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: [ 'GET', 'POST', 'DELETE', 'UPDATE', 'PUT' ]
}));
app.use("/local_business_certificates", express.static(path.join(__dirname, './local_business_certificates')));
app.use("/hotel", express.static(path.join(__dirname, './hotel')));

const ROUTER = express.Router({
    caseSensitive: true,
    strict       : true
});

app.use(ROUTER);

// GET method endpoints
ROUTER.get('/admin/:uid', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query('select phone_num from user where uid=?', [ req.params.uid ], (err, result) => {
                if (result.length === 0 || !adminPhonenum.includes(parseInt(result[0].phone_num))) {
                    res.sendStatus(401);
                } else {
                    res.sendStatus(200);
                }
            });
        }
    });
})
.get('/booked-vehicles/:uid?', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query(`select b.booking_id, b.from_date, b.till_date, v.license_plate, v.colour, v.type, 
                concat_ws(' ', d.fname, d.mname, d.lname) as driver_name, d.phone_num from vehicle_booking b 
                join vehicle v on b.vehicle_id=v.vehicle_id join driver d on v.driver_id=d.driver_id where 
                b.booked_by=? order by b.from_date`, [ req.params.uid ], (err, result) => {
                    if (err) {
                        console.log(err);
                        res.status(500).send(err);
                    } else {
                        if (result.length === 0) {
                            res.sendStatus(204);
                        } else {
                            res.status(200).send(result);
                        }
                    }
                }
            );
        }
    });
})
.get('/available-vehicles', (req, res) => {
    if (Object.keys(req.query).length < 2) {
        res.status(400).send({ 
            msg: "Query string must contain at least 2 arguments." ,
            errCode: 2000
        });
    } else if (Object.keys(req.query).length > 3) {
        res.status(400).send({ 
            msg: "Query string cannot have more than 3 arguments." ,
            errCode: 2001
        });
    } else {
        if (req.query.from_time === undefined || req.query.to_time === undefined) {
            res.status(400).send({ 
                msg: "Invalid arguments passed! Arguments allowed: 'from_time' (required), 'to_time' (required), and 'type'." ,
                errCode: 2002
            });
        } else {
            var query;

            if (req.query.type === undefined) {
                query = 
                    `select v.vehicle_id, v.license_plate, v.colour, v.type, 
                    concat_ws(' ', d.fname, d.mname, d.lname) as driver_name, d.phone_num from vehicle v join driver d 
                    on v.driver_id=d.driver_id where v.vehicle_id not in 
                    (select b.vehicle_id from vehicle_booking b where b.from_date <= ? and b.till_date >= ?)`;
            } else {
                query = 
                    `select v.vehicle_id, v.license_plate, v.colour, v.type, 
                    concat_ws(' ', d.fname, d.mname, d.lname) as driver_name, d.phone_num from vehicle v join driver d 
                    on v.driver_id=d.driver_id where v.vehicle_id not in 
                    (select b.vehicle_id from vehicle_booking b where b.from_date <= ? and b.till_date >= ?) and type = ?`;
            }

            conn.connect((err) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    var filters = [ req.query.to_time, req.query.from_time ];
                    
                    if (req.query.type !== undefined)
                        filters.push(req.query.type);
                    
                    conn.query(query, filters, (err, result) => {
                        if (err) {
                            if (err.errno === 1525) {
                                res.status(400).send({
                                    msg: err.sqlMessage,
                                    errCode: 1020
                                });
                            } else {
                                console.log(err);
                                res.status(500).send(err);
                            }
                        } else {
                            var resResults = [];
                            console.log(result);

                            for (var i = 0; i < result.length; i++) {
                                resResults.push({
                                    vehicle_details: {
                                        vehicle_id: result[i].vehicle_id,
                                        license_plate: result[i].license_plate,
                                        colour: result[i].colour,
                                        type: result[i].type
                                    },
                                    driver_details: {
                                        name: result[i].driver_name,
                                        phone: result[i].phone_num
                                    }
                                });
                            }

                            res.status(200).send(resResults);
                        }
                    });
                }
            });
        }
    }
})
.get("/get-hotels-info", (req, res) => {
    let query = null;
    let filters = [];

    if (Object.keys(req.query).length == 2) {
        if (req.params.lowest_price === undefined || req.params.highest_price === undefined) {
            res.status(400).send({ msg: "Query string must contain 'lowest_price' and 'highest_price'.", errCode: 2002 });
            return;
        }

        query = 'select * from hotel where lowest_price >= ? and highest_price <= ?';
        filters.push(parseFloat(req.params.lowest_price));
        filters.push(parseFloat(req.params.highest_price));
    } else {
        query = 'select * from hotel';
    }

    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query(query, filters, (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    res.status(200).send(result);
                }
            });
        }
    });
})
.get('/feedback-on/:id', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query(`select f.comment, f.rating, f.given_on, concat_ws(" ", u.fname, u.mname, u.lname) as name
            from feedback f join general_user u on f.given_by=u.uid where f.feedback_for=?`, [ req.params.id ], (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    res.status(200).send(result);
                }
            });
        }
    });
})
.get('/get/:table', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query(`select * from ${ req.params.table }`, (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    res.status(200).send(result);
                }
            });
        }
    });
})
.get('/get-business-details/:uid', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query('select * from local_business where uid=?', [ req.params.uid ], (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    res.status(200).send(result[0]);
                }
            });
        }
    });
})
.get('/get-certificates/:id?', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            let query, data = [];

            if (req.params.id === undefined) {
                query = 'select * from lb_certificate';
            } else {
                query = 'select * from lb_certificate where uid=?';
                data.push(req.params.id);
            }

            conn.query(query, data, (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    const certificates = [];
                    const absolute = [];

                    console.log(__dirname);

                    for (let i = 0; i < result.length; i++) {
                        console.log(result[i].certificate);
                        certificates.push({
                            uid: result[i].uid,
                            link: result[i].certificate.replace(__dirname, '.'),
                            isVerified: result[i].is_verified === 1,
                            verifiedBy: result[i].verified_by
                        });
                        absolute.push(result[i].certificate);
                    }
                    
                    res.status(200).send({ certificates: certificates, absolute: absolute });
                }
            });
        }
    });
})
.get('/hotel-images-info', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query('select hotel_id, name, image from hotel', (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    for (let i = 0; i < result.length; i++) {
                        console.log(result[i].image);
                        if (result[i].image !== null && result[i].image !== "null")
                            result[i].image = result[i].image.replace(__dirname, '.');
                    }

                    res.status(200).send(result);
                }
            });
        }
    });
});

// POST method endpoints
ROUTER.post('/register-user/:type', (req, res) => {
    conn.connect((err) => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query('select uid, salt_value from user', (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    const [ uid, salt ] = generateUniqueIDAndSalt(result, MAX_UID, MIN_UID);
                    
                    crypto.scrypt(req.body.password, salt, 32, (err, derivedKey) => {
                        if (err) {
                            console.log(err);
                            res.status(500).send(err);
                        } else {
                            var password = derivedKey.toString('base64');
                            
                            conn.query(`insert into user values (${ uid }, "${ req.body.email }", "${ req.body.phone_num }",
                            "${ password }", "${ salt }")`, (err, result) => {
                                if (err) {
                                    console.log(err);
                                    
                                    if (err.code === 'ER_DUP_ENTRY') {
                                        if (err.sqlMessage.includes('user.email')) {
                                            res.status(400).send({ msg: 'Duplicate email', errCode: 1000 });
                                        } else {
                                            res.status(400).send({ msg: 'Duplicate phone number', errCode: 1001 });
                                        }
                                    } else {
                                        console.log(err);
                                        res.status(500).send(err);
                                    }
                                } else {
                                    req.body.uid = uid;

                                    if (req.params.type === 'general') {
                                        registerGeneral(conn, req.body, error => {
                                            if (error) {
                                                console.log(error);
                                                res.status(500).send(error);
                                            } else {
                                                res.sendStatus(200);
                                            }
                                        });
                                    } else {
                                        registerLocalBusiness(conn, req.body, error => {
                                            if (error) {
                                                console.log(error);
                                                res.status(500).send(error);
                                            } else {
                                                res.sendStatus(200);
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
    });
})
.post("/login-email", (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query(`select password, salt_value from user where email="${ req.body.email }"`, (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    if (result.length === 0) {
                        res.status(404).send({ msg: "Invalid email", errCode: 1010 });
                    } else {
                        crypto.scrypt(req.body.password, result[0].salt_value, 32, (err, derivedKey) => {
                            if (err) {
                                console.log(err);
                                res.status(500).send(err);
                            } else {
                                if (result[0].password === derivedKey.toString('base64')) {
                                    res.sendStatus(200);
                                } else {
                                    const uid = result[0].uid;
                                    
                                    crypto.scrypt(req.body.password, result[0].salt_value, 32, (err, derivedKey) => {
                                        if (err) {
                                            console.log(err);
                                            res.status(500).send(err);
                                        } else {
                                            if (result[0].password === derivedKey.toString('base64')) {
                                                conn.query('select concat_ws(" ", fname, mname, lname) as name from general_user where uid=?', uid, (err, result) => {
                                                    if (err) {
                                                        console.log(err);
                                                        res.status(500).send(err);
                                                    } else {
                                                        if (result.length === 0) {
                                                            conn.query('select business_name from local_business where uid=?', uid, (err, result) => {
                                                                if (err) {
                                                                    console.log(err);
                                                                    res.status(500).send(err);
                                                                } else {
                                                                    res.status(200).send({ uid: uid, name: result[0].business_name, isBusiness: true });
                                                                }
                                                            });
                                                        } else {
                                                            res.status(200).send({ uid: uid, name: result[0].name, isAdmin: adminEmail.includes(req.body.email) });
                                                        }
                                                    }
                                                });
                                            } else {
                                                res.status(404).send({ msg: "Incorrect password", errCode: 1011 });
                                            }
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
            });
        }
    });
})
.post('/login-phone', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query(`select uid, password, salt_value from user where phone_num="${ req.body.phonenum }"`, (err, result) => {
                
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    if (result.length === 0) {
                        res.status(404).send({ msg: "Invalid phone number", errCode: 1012 });
                    } else {
                        const uid = result[0].uid;
                        
                        crypto.scrypt(req.body.password, result[0].salt_value, 32, (err, derivedKey) => {
                            if (err) {
                                console.log(err);
                                res.status(500).send(err);
                            } else {
                                if (result[0].password === derivedKey.toString('base64')) {
                                    conn.query('select concat_ws(" ", fname, mname, lname) as name from general_user where uid=?', uid, (err, result) => {
                                        if (err) {
                                            console.log(err);
                                            res.status(500).send(err);
                                        } else {
                                            if (result.length === 0) {
                                                conn.query('select business_name from local_business where uid=?', uid, (err, result) => {
                                                    if (err) {
                                                        console.log(err);
                                                        res.status(500).send(err);
                                                    } else {
                                                        res.status(200).send({ uid: uid, name: result[0].business_name, isBusiness: true });
                                                    }
                                                });
                                            } else {
                                                res.status(200).send({ uid: uid, name: result[0].name, isAdmin: adminPhonenum.includes(parseInt(req.body.phonenum)) });
                                            }
                                        }
                                    });
                                } else {
                                    res.status(404).send({ msg: "Incorrect password", errCode: 1011 });
                                }
                            }
                        });
                    }
                }
            });
        }
    });
})
.post('/book-vehicle', (req, res) => {
    conn.connect((err) => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query('select vehicle_id from vehicle where license_plate=?', req.body.license_plate, (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    if (result.length === 0) {
                        res.status(400).send({ msg: "License plate not registered", errCode: 1030 });
                    } else {
                        const vehicleID = result[0].vehicle_id;
    
                        conn.query('insert into vehicle_booking values (default, ?, ?, ?, ?)', 
                            [ req.body.booked_by, req.body.from_date, req.body.till_date, vehicleID ], (err, result) => {
                                if (err) {
                                    console.log(err);
                                    res.status(500).send(err);
                                } else {
                                    res.sendStatus(200);
                                }
                        });
                    }
                }
            });
        }
    });
})
.post('/add/:table', (req, res) => {
    let query, data;
    let invalidParams = false;

    switch (req.params.table) {
        case "hotel":
            query = 'insert into hotel values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            data = [ req.body.hotel_id, req.body.name, req.body.address_line1, req.body.address_line2,
                req.body.address_line3, req.body.pincode, req.body.highest_price, req.body.lowest_price, 
                req.body.description, req.body.link ];
            break;
        case "vehicle":
            query = 'insert into vehicle values (?, ?, ?, ?, ?)';
            data = [ req.body.vehicle_id, req.body.license_plate, req.body.colour, req.body.type, 
                req.body.driver_id ];
            break;
        case "driver":
            query = 'insert into driver values (?, ?, ?, ?, ?, ?)';
            data = [ req.body.driver_id, req.body.fname, req.body.mname, req.body.lname, req.body.phone_num, 
                req.body.license_num ];
            break;
        case "tourist_spot":
            query = 'insert into tourist_spot values (?, ?, ?, ?, ?, ?, ?, ?, ?)';
            data = [ req.body.id, req.body.name, req.body.address_line1, req.body.address_line2, 
                req.body.address_line3, req.body.pincode, req.body.description, req.body.opening_time, 
                req.body.closing_time ];
            break;
        default:
            invalidParams = true;
    }

    if (invalidParams) {
        res.status(400).send({ msg: "Unsupported table name", errCode: 2004 });
    } else {
        conn.connect(err => {
            if (err) {
                console.log(err);
                res.status(500).send(err);
            } else {
                conn.query(query, data, (err, result) => {
                    if (err) {
                         console.log(err);
                         res.status(500).send(err);
                     } else {
                         res.status(200).send(result);
                     }
                 });
            }
        });
    }
})
.post('/save-certificate/:id', (req, res) => {
    const filename = req.files.img.name;

    const filepath = path.join(__dirname, `./local_business_certificates/${ req.params.id }`, filename);
    console.log(filepath);

    req.files.img.mv(filepath, err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.connect(err => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    conn.query('insert into lb_certificate values (?, ?, 0, NULL)', [ req.params.id, filepath ], (err, result) => {
                        if (err) {
                            console.log(err);
                            res.status(500).send(err);
                        } else {
                            res.sendStatus(200);
                        }
                    });
                }
            });
        }
    });
})
.post('/upload-hotel-image/:hotel_id', (req, res) =>{ 
    const filename = req.files.img.name;
    
    let filepath = path.join(__dirname, `./hotel/${ req.params.hotel_id }`, filename);
    filepath = filepath.replace(/\\/g, "\\\\");
    console.log(filename, filepath);

    req.files.img.mv(filepath, err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.connect(err => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    const query = `update hotel set image="${ filepath }" where hotel_id=${ req.params.hotel_id }`;
                    console.log(query);
                    conn.query(query, (err, result) => {
                        if (err) {
                            console.log(err);
                            res.status(500).send(err);
                        } else {
                            res.sendStatus(200);
                        }
                    });
                }
            })
        }
    })
});

// DELETE method endpoints
ROUTER.delete('/cancel-booking/:booking_id', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query('delete from vehicle_booking where booking_id=?', [ req.params.booking_id ], (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    res.sendStatus(200);
                }
            });
        }
    });
})
.delete('/delete/:table/:idname/:id', (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query(`delete from ${ req.params.table } where ${ req.params.idname } = ?`, [ req.params.id ], (err, result) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    res.sendStatus(200);
                }
            });
        }
    });
})
.delete('/delete-certificate', bodyParser.text({ type: '*/*' }), (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query('delete from lb_certificate where certificate=?', [ req.body ], (err, result) => {
                if (err) { 
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    fs.unlink(req.body, err => {
                        if (err) {
                            console.log(err);
                            res.status(500).send(err);
                        } else {
                            res.sendStatus(200);
                        }
                    });
                }
            });
        }
    });
});

// PUT method endpoints
ROUTER.put('/update/:table/:id', (req, res) => {
    let query, data;
    let invalidParams = false;
    console.log(req.params.table);

    switch (req.params.table) {
        case "hotel":
            query = `update hotel set hotel_id=?, name=?, address_line1=?, address_line2=?, address_line3=?, 
                pincode=?, highest_price=?, lowest_price=?, description=?, link=? where hotel_id=?`;
            data = [ req.body.hotel_id, req.body.name, req.body.address_line1, req.body.address_line2,
                req.body.address_line3, req.body.pincode, req.body.highest_price, req.body.lowest_price, 
                req.body.description, req.body.link, req.params.id ];
            break;
        case "vehicle":
            query = `update vehicle set vehicle_id=?, license_plate=?, colour=?, type=?, driver_id=? where vehicle_id=?`;
            data = [ req.body.vehicle_id, req.body.license_plate, req.body.colour, req.body.type, req.body.driver_id, 
                req.params.id ];
            break;
        case "driver":
            query = `update driver set driver_id=?, fname=?, mname=?, lname=?, phone_num=?, license_num=? where driver_id=?`;
            data = [ req.body.driver_id, req.body.fname, req.body.mname, req.body.lname, req.body.phone_num, 
                req.body.license_num, req.params.id ];
            break;
        case "tourist_spot":
            query = `update tourist_spot set id=?, name=?, address_line1=?, address_line2=?, address_line3=?, pincode=?, 
                description=?, opening_time=?, closing_time=? where id=?`;
            data = [ req.body.id, req.body.name, req.body.address_line1, req.body.address_line2, req.body.address_line3, 
                req.body.pincode, req.body.description, req.body.opening_time, req.body.closing_time, req.params.id ];
            break;
        case "local_business":
            query = `update local_business set address_line1=?, address_line2=?, address_line3=?, pincode=?, business_name=?,
                aadhaar_num=?`;
            data = [ req.body.address_line1, req.body.address_line2, req.body.address_line3, req.body.pincode, 
                req.body.business_name, req.body.aadhaar_num ];
            break;
        default:
            invalidParams = true;
    }

    if (invalidParams) {
        res.status(400).send({ msg: "Unsupported table name", errCode: 2004 });
    } else {
        conn.connect(err => {
            if (err) {
                console.log(err);
                res.status(500).send(err);
            } else {
                conn.query(query, data, (err, result) => {
                    if (err) {
                         console.log(err);
                         res.status(500).send(err);
                     } else {
                         res.sendStatus(200);
                     }
                 });
            }
        });
    }
})
.put('/verify-certificate/:verified_by', bodyParser.text({ type: '*/*' }), (req, res) => {
    conn.connect(err => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            conn.query('update lb_certificate set is_verified=1, verified_by=? where certificate=?', [ req.params.verified_by,
                req.body ], (err, result) => {
                    if (err) {
                        console.log(err);
                        res.status(500).send(err);
                    } else {
                        res.sendStatus(200);
                    }
            });
        }
    });
});

app.use((req, res, next) => {
    res.sendStatus(404);
});

function main() {
    if (fs.existsSync(dbDetailsPath)) {
        conn = mysql.createConnection(JSON.parse(fs.readFileSync(dbDetailsPath, 'utf8')));

        app.listen(PORT, () => {
            console.log(`Back end server running at: http://localhost:${PORT}`);
        });
    } else {
        readline.question('Enter db password: ', password => {
            var dbDetails = {
                host: 'localhost',
                user: 'root',
                password: password,
                database: 'namma_bangalore'
            }

            readline.close();

            fs.writeFileSync(dbDetailsPath, JSON.stringify(dbDetails, null, 4), 'utf8', () => {
                main();
            });
        });
    }
}

main();