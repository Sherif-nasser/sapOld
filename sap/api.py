import datetime
import requests
import frappe
import json
import time
from sap.qr_generator import get_qr

@frappe.whitelist()
def update_item_waiting_quality(name):
   # print ("\n i'm in \n ")
    doc = frappe.get_doc("Product Order Details",name)    
   
    doc.item_status = "Waiting Quality"
    
    doc.save()
    frappe.db.commit()
    return True

@frappe.whitelist()
def get_items_wait_quality(pallet_no='', start_date='', end_date='', item_serial='', document_no=''):
    """
    return a list of dicts of Product Order Details(child table) joined with Product
    Order(parent table) which there item_status = 'Waiting Quality' filtered on the
    function input, if there wasn't any input the function return all waiting Quality
    items without filter

    pallet_no = Product Order Details pallet_no
    document_no = Product Order document_no
    start_date = the creation date of Product Order Details created on or after the start_date
    end_date = the creation date of Product Order Details created on or before the end_date
    """

    query = """
        SELECT pd.name, p.name AS product_name, pd.pallet_no, pd.gross_weight, pd.net_weight, pd.quality_status, pd.item_status, p.document_no, p.item_group, p.customer_no, p.customer_name, p.quantity, p.length, p.width, p.item_serial, p.weight, p.thickness, p.core_type, p.core_weight, p.total_weight, p.application
        FROM `tabProduct Order` AS p JOIN `tabProduct Order Details` AS pd
        ON (p.name = pd.parent)
        WHERE (pd.item_status='Waiting Quality')
        """

    if item_serial:
        query += f" AND p.item_serial='{item_serial}'"
    if pallet_no:
        query += f" AND pd.pallet_no='{pallet_no}'"

    if start_date:
        query += f" AND pd.creation>='{start_date}'"

    if end_date:
        end_date = datetime.datetime.strptime(end_date, "%Y-%m-%d")
        end_date += datetime.timedelta(days=1)
        query += f" AND pd.creation<='{end_date}'"

    if document_no:
        query += f" AND p.document_no='{document_no}'"

    items = frappe.db.sql(query, as_dict=1)
    return items


@frappe.whitelist()
def update_item_quality(name, status, qt_inspection):
    """
    update the status and quality inspection values of the Product Order Details

    name = Product Order Details name
    status = Product Order Details new status
    qt_inspection = Product Order Details new quality inspection value
    """
    doc = frappe.get_doc("Product Order Details", name)
    doc.quality_status = status
    doc.item_status = "Inspected"
    doc.qt_inspection = qt_inspection
    doc.save()
    frappe.db.commit()
    return True


def session_login(url, company_db, username, password):

    payload = json.dumps({
        "CompanyDB": company_db,
        "Password": password,
        "UserName": username
    })
    headers = {
        'Content-Type': 'application/json'
    }

    response = requests.request("POST", url, headers=headers, data=payload)

    session_id = json.loads(response.text)['SessionId']
    return session_id


@frappe.whitelist()
def get_products_from_sap(progress=False):

    product_setting = frappe.get_doc("Product Setting")
    login_url = product_setting.login_url
    password = product_setting.password
    username = product_setting.user_name
    company_db = product_setting.company_db

    session_id = session_login(login_url, company_db, username, password)

    payload = {}
    headers = {
        'Cookie': f'B1SESSION={session_id}'
    }

    response = requests.request(
        "GET", product_setting.product_url, headers=headers, data=payload)
    try:
        sap_products = json.loads(response.text)["value"]
    except KeyError:
        frappe.throw("No values Provided check your URL")

    for i in range(len(sap_products)):
        exists = frappe.db.exists("Product Order", {
                                  "document_no": sap_products[i]['DocEntry'], "code": sap_products[i]['Code']})
        if not exists:
            product = frappe.new_doc('Product Order')
            ignored = {"name", "owner", "creation", "modified", "modified_by", "parent", "parentfield", "parenttype", "idx",
                       "docstatus", "company_db", "user_name", "password", "default_scaler", "doctype", "login_url", "product_url"}
            for value in product_setting.as_dict():
                if value not in ignored:
                    setattr(product, value, sap_products[i].get(
                        product_setting.get(value)))
            product.insert()

    try:
        frappe.db.commit()
        return {'success': True}
    except:
        return {'success': False}


@frappe.whitelist()
def send_product_to_sap(product_name, items=None, shift_employee=''):
    log = frappe.new_doc("Sap Integration Log")
    post_product_setting = frappe.get_doc("Post Product Setting").as_dict()

    login_url = post_product_setting["login_url"]
    password = post_product_setting["password"]
    username = post_product_setting["user_name"]
    company_db = post_product_setting["company_db"]
    url = post_product_setting["product_url"]

    session_id = session_login(login_url, company_db, username, password)

    ignored = {"name", "owner", "creation", "modified", "modified_by", "parent", "parentfield", "parenttype", "idx",
               "docstatus", "company_db", "user_name", "password", "default_scaler", "doctype", "login_url", "product_url"}

    product = frappe.db.get('Product Order', product_name)
    log.product = product.name
    log.product_no = product.document_no
    log.items = ""
    data = {
        "DocType": "dDocument_Items",
        "DocDate": str(product.creation.date()),
        "DocumentLines": [
            {
                "BaseType": 202,
                "BaseEntry": product.document_no
            }
        ]
    }
    batch_number = []
    total_quantity = 0
    if items:
        items_list = [frappe.db.get("Product Order Details", item)
                      for item in json.loads(items)]
    else:
        items = frappe.db.get_list("Product Order Details", filters={'item_status': [
                                   '!=', 'Sent to SAP'], 'parent': product.name})
        if not items:
            return {"success": True}

        items_list = [frappe.db.get("Product Order Details", item)
                      for item in items]

    for item in items_list:
        #log.items += str(item.idx) + ", "
        batch = {}
        batch["BatchNumber"] = str(product.document_no) + "/" + str(item.idx)
        batch["AddmisionDate"] = str(item.get("creation").date())

        if product.get("weight_type") == "وزن صافى":
            try:
                batch["Quantity"] = item["net_weight"]
                total_quantity += float(item["net_weight"])
            except:
                return {"success": False,
                        "message": "make sure you set all items Net Weight"}
        else:
            try:
                batch["Quantity"] = item["gross_weight"]
                total_quantity += float(item["gross_weight"])
            except:
                return {"success": False,
                        "message": "make sure you set all items Gross Weight"}

        batch["InternalSerialNumber"] = product.get("sorder")
        batch["U_B1Customer"] = product.customer_name
        batch["Location"] = str(product.document_no) + \
            '/' + str(item.get("pallet_no", ''))

        for value in post_product_setting:
            if value not in ignored:
                batch[post_product_setting[value]
                      ] = product.get(value, '')

        batch[post_product_setting["net_weight"]
              ] = item.get("net_weight", '')
        batch[post_product_setting["gross_weight"]
              ] = item.get("gross_weight", '')
        batch[post_product_setting["jambo_roll_no"]
              ] = item.get("jambo_roll_no", '')

        batch_number.append(batch)

    data["DocumentLines"][0]["BatchNumbers"] = batch_number
    data["DocumentLines"][0]["Quantity"] = total_quantity

    headers = {
        'Cookie': f'B1SESSION={session_id}'
    }
    payload = json.dumps(data)
    response = requests.request("POST", url, headers=headers, data=payload)
    resp = json.loads(response.text)
    if response.status_code == 201:
        log.status = "Success"
        log.insert()
        frappe.db.commit()
        return {"success": True}
    else:
        log.status = "Failed"
        log.message = f"SAP: {resp['error']['message']['value']}"
        log.insert()
        frappe.db.commit()
        return {"success": False, "message": f"SAP: {resp['error']['message']['value']}"}


@frappe.whitelist()
def send_payroll(name):
    post_product_setting = frappe.get_doc("Post Product Setting").as_dict()
    login_url = post_product_setting["login_url"]
    password = post_product_setting["password"]
    username = post_product_setting["user_name"]
    company_db = post_product_setting["company_db"]
    url = "https://htpc20847p01.cloudiax.com:50000/b1s/v1/JournalVouchersService_Add"

    session_id = session_login(login_url, company_db, username, password)

    doc = frappe.get_doc("Journal Entry", name).as_dict()
    entries = []

    for i in doc.get('accounts', []):
        row = {
            "AccountCode": i.get("account", ''),
            "Debit": i.get("debit", ''),
            "Credit": i.get("credit", '')
        }
        entries.append(row)
    data = {
        "JournalVoucher": {
            "JournalEntry":
            {
                "ReferenceDate": str(doc.get("posting_date", '')),
                "JournalEntryLines": entries
            }
        }
    }
    payload = json.dumps(data)
    headers = {
        'Content-Type': 'application/json',
        'Cookie': f'B1SESSION={session_id}'
    }
    response = requests.request("POST", url, headers=headers, data=payload)
    if response.status_code != 201 and response.status_code != 204:
        resp = json.loads(response.text)
        return {"success": False, "message": f"SAP: {resp['error']['message']['value']}"}
    else:
        return {'success': True}


@frappe.whitelist()
def send_loan(name):  # done
    post_product_setting = frappe.get_doc("Post Product Setting").as_dict()
    login_url = post_product_setting["login_url"]
    password = post_product_setting["password"]
    username = post_product_setting["user_name"]
    company_db = post_product_setting["company_db"]
    url = "https://htpc20847p01.cloudiax.com:50000/b1s/v1/JournalVouchersService_Add"

    session_id = session_login(login_url, company_db, username, password)

    doc = frappe.get_doc("Loan Disbursement", name)
    data = {
        "JournalVoucher": {
            "JournalEntry":
            {
                "ReferenceDate": str(doc.disbursement_date),
                "JournalEntryLines": [
                    {
                        "AccountCode": doc.loan_account,
                        "Debit": doc.disbursed_amount,
                    },
                    {
                        "AccountCode": doc.disbursement_account,
                        "Credit": doc.disbursed_amount
                    }
                ]
            }
        }
    }

    payload = json.dumps(data)
    headers = {
        'Content-Type': 'application/json',
        'Cookie': f'B1SESSION={session_id}'
    }
    response = requests.request("POST", url, headers=headers, data=payload)

    if response.status_code != 201 and response.status_code != 204:
        resp = json.loads(response.text)
        return {"success": False, "message": f"SAP: {resp['error']['message']['value']}"}
    else:
        return {'success': True}


@frappe.whitelist()
def generate_qr(data):
    return get_qr(data)


@frappe.whitelist()
def get_qc_from_sap():
    post_product_setting = frappe.get_doc("Post Product Setting").as_dict()
    login_url = post_product_setting["login_url"]
    password = post_product_setting["password"]
    username = post_product_setting["user_name"]
    company_db = post_product_setting["company_db"]

    session_id = session_login(login_url, company_db, username, password)

    max_doc = frappe.db.sql(
        "select MAX(doc_entry) as m from `tabQC Integration`;", as_dict=1)[0]['m'] or 0

    available_items_url = f"https://htpc20847p01.cloudiax.com:50000/b1s/v1/PurchaseDeliveryNotes?$select = DocEntry& $filter= DocEntry gt {max_doc}"

    payload = {}
    headers = {
        'Cookie': f'B1SESSION={session_id}'
    }

    response = requests.request(
        "GET", available_items_url, headers=headers, data=payload)

    values = json.loads(response.text)['value']
    for value in values:
        doc_e = value['DocEntry']
        item_url = f"https://htpc20847p01.cloudiax.com:50000/b1s/v1/PurchaseDeliveryNotes({doc_e})"
        headers = {
            'Cookie': f'B1SESSION={session_id}'
        }
        response = requests.request(
            "GET", item_url, headers=headers, data={})
        item = json.loads(response.text)
        for i in item['DocumentLines']:
            doc = frappe.new_doc("QC Integration")
            doc.doc_num = item.get('DocNum')
            doc.doc_entry = item.get('DocEntry')
            doc.doc_date = item.get('DocDate')
            doc.item_code = i.get('ItemCode')
            doc.item_description = i.get('ItemDescription')
            doc.quantity = i.get('Quantity')
            doc.batch_numbers = []
            for batch_num in i.get('BatchNumbers'):
                child = frappe.new_doc("QC Integration Details")
                child.batchnumber = batch_num.get("BatchNumber")
                child.expirydate = batch_num.get("ExpiryDate")
                child.quantity = batch_num.get("Quantity")
                child.u_b1abs = batch_num.get("U_B1ABS")
                child.parent = doc.name
                child.parenttype = 'QC Integration'
                doc.append('batch_numbers', child)
            doc.insert()
    frappe.db.commit()
    return {'success': True}


@frappe.whitelist()
def send_qc_to_sap(items):
    post_product_setting = frappe.get_doc("Post Product Setting").as_dict()
    login_url = post_product_setting["login_url"]
    password = post_product_setting["password"]
    username = post_product_setting["user_name"]
    company_db = post_product_setting["company_db"]

    session_id = session_login(login_url, company_db, username, password)
    headers = {
        'Cookie': f'B1SESSION={session_id}'
    }
    items = json.loads(items)
    for item in items:
        rec = frappe.get_doc("QC Integration Details", item)
        data = {
            "Status": "bdsStatus_Released",
            "U_B1B023": rec.status
        }
        url = f"https://htpc20847p01.cloudiax.com:50000/b1s/v1/BatchNumberDetails({rec.u_b1abs})"
        payload = json.dumps(data)

        response = requests.request(
            "PATCH", url, headers=headers, data=payload)
        if response.status_code == 204:
            return {'success': True}
        else:
            resp = json.loads(response.text)
            return {"success": False, "message": f"SAP: {resp['error']['message']['value']}"}
