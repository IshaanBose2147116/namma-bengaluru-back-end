try:
    import mysql.connector as mysql
except ModuleNotFoundError:
    print("run: pip install mysql-connector-python")
    exit(1)

details = {
    "username": None,
    "password": None
}

db = None

def createDBConnection():
    global db

    try:
        db = mysql.connect(
            host="localhost",
            user=details["username"],
            password=details["password"],
            db="namma_bangalore"
        )
    except Exception:
        db = mysql.connect(
            host="localhost",
            user=details["username"],
            password=details["password"]
        )

        cursor = db.cursor()
        cursor.execute("create database namma_bangalore")

        db.close()

        createDBConnection()
    
def createTables():
    cursor = db.cursor()

    cursor.execute(
        ("create table user("
        "uid int primary key,"
        "email varchar(50) not null,"
        "phone_num varchar(10) not null,"
        "password varchar(50) not null,"
        "salt_value varchar(30) not null,"
        "unique (email), unique(phone_num), unique(salt_value))")
    )

    cursor.execute(
        ("create table general_user("
        "uid int not null,"
        "fname varchar(25) not null,"
        "mname varchar(25),"
        "lname varchar(25),"
        "is_admin tinyint(1) not null,"
        "unique (uid),"
        "foreign key (uid) references user(uid))")
    )

    cursor.execute(
        ("create table local_business("
        "uid int not null,"
        "address_line1 varchar(50) not null,"
        "address_line2 varchar(50),"
        "address_line3 varchar(50),"
        "pincode varchar(6) not null,"
        "business_name varchar(30) not null,"
        "aadhaar_num varchar(12) not null,"
        "unique (uid),"
        "foreign key (uid) references user(uid))")
    )

    cursor.execute(
        ("create table lb_certificate("
        "uid int not null,"
        "certificate varchar(50) not null,"
        "is_verified bool default 0,"
        "verified_by int,"
        "foreign key (uid) references user(uid),"
        "foreign key (verified_by) references user(uid))")
    )

    cursor.execute(
        ("create table job_posting("
        "posted_by int not null,"
        "posted_on datetime not null,"
        "job_title varchar(30) not null,"
        "description varchar(100),"
        "experience bit,"
        "salary decimal(11, 2) not null,"
        "starts_by datetime,"
        "expires_by datetime,"
        "unique (posted_on),"
        "foreign key (posted_by) references user(uid))")
    )

    cursor.execute(
        ("create table jp_contact_info("
        "posted_by int not null,"
        "posted_on datetime not null,"
        "contact_info varchar(50) not null,"
        "foreign key (posted_by) references user(uid))")
    )

    cursor.execute(
        ("create table jp_required_skills("
        "posted_by int not null,"
        "posted_on datetime not null,"
        "skill varchar(30) not null,"
        "foreign key (posted_by) references user(uid))")
    )

    cursor.execute(
        ("create table promotion("
        "posted_by int not null,"
        "posted_on datetime not null,"
        "prod_name varchar(50) not null,"
        "description varchar(50),"
        "expires_by datetime,"
        "foreign key (posted_by) references user(uid))")
    )

    cursor.execute(
        ("create table driver("
        "driver_id int primary key,"
        "fname varchar(25) not null,"
        "mname varchar(25),"
        "lname varchar(25),"
        "phone_num varchar(10) not null,"
        "license_num varchar(15) not null,"
        "unique (phone_num), unique (license_num))")
    )

    cursor.execute(
        ("create table vehicle("
        "vehicle_id int primary key,"
        "license_plate varchar(10) not null,"
        "colour varchar(20) not null,"
        "type varchar(20) not null,"
        "driver_id int not null,"
        "unique (license_plate),"
        "foreign key (driver_id) references driver(driver_id))")
    )

    cursor.execute(
        ("create table tourist_spot("
        "id int primary key,"
        "name varchar(30) not null,"
        "address_line1 varchar(50) not null,"
        "address_line2 varchar(50),"
        "address_line3 varchar(50),"
        "pincode varchar(6) not null,"
        "description varchar(150),"
        "opening_time time,"
        "closing_time time)")
    )

    cursor.execute(
        ("create table hotel("
        "hotel_id int primary key,"
        "name varchar(30) not null,"
        "address_line1 varchar(50) not null,"
        "address_line2 varchar(50),"
        "address_line3 varchar(50),"
        "pincode varchar(6) not null,"
        "highest_price decimal(11, 2),"
        "lowest_price decimal(11, 2))")
    )

    cursor.execute(
        ("create table vehicle_booking("
        "booking_id int primary key auto_increment,"
        "booked_by int not null,"
        "from_date datetime,"
        "till_date datetime,"
        "vehicle_id int not null,"
        "foreign key (booked_by) references user(uid),"
        "foreign key (vehicle_id) references vehicle(vehicle_id))")
    )

    cursor.execute(
        ("create table feedback("
        "feedback_id int primary key,"
        "comment varchar(100),"
        "rating tinyint(1) not null,"
        "given_by int not null,"
        "feedback_for int not null,"
        "given_on datetime not null,"
        "feedback_on varchar(15) not null,"
        "check (rating >= 1 and rating <= 5),"
        "foreign key (given_by) references user(uid))")
    )

if __name__ == '__main__':
    details["username"] = input("Enter username: ")
    details["password"] = input("Enter password: ")

    createDBConnection()
    print("Database 'namma_bangalore' created!")
    createTables()
    print("Tables created!")

    db.close()