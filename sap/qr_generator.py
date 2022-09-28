import frappe
import json
import qrcode
from PIL import Image
import base64, os
from io import BytesIO

def get_qr(data):
    qr = qrcode.QRCode(
        version=7,
        box_size=6,
        border=3
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    temp = BytesIO()
    img.save(temp, "PNG")
    temp.seek(0)
    b64 = base64.b64encode(temp.read())
    return "data:image/png;base64,{0}".format(b64.decode("utf-8"))
