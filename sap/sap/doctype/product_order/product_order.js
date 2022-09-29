// Copyright (c) 2022, ahmed and contributors
// For license information, please see license.txt
frappe.require(["assets/sap/js/mqtt.min.js"]);
frappe.provide("frappe.meta");

$.extend(frappe.meta, {
  get_print_formats: function (doctype) {
    var print_format_list = ["Standard"];
    var default_print_format = locals.DocType[doctype].default_print_format;
    let enable_raw_printing = frappe.model.get_doc(
      ":Print Settings",
      "Print Settings"
    ).enable_raw_printing;
    var print_formats = frappe
      .get_list("Print Format", { doc_type: doctype })
      .sort(function (a, b) {
        return a > b ? 1 : -1;
      });
    $.each(print_formats, function (i, d) {
      if (
        !in_list(print_format_list, d.name) &&
        d.print_format_type !== "JS" &&
        (cint(enable_raw_printing) || !d.raw_printing)
      ) {
        print_format_list.push(d.name);
      }
    });

    const cur_print_format =
      locals["Product Order"][Object.keys(locals["Product Order"]).pop()]
        .print_format;
    if (cur_print_format) {
      return [cur_print_format];
      // default_print_format = cur_print_format;
      // console.log(default_print_format)
      // var index = print_format_list.indexOf(default_print_format);
      // print_format_list.splice(index, 1).sort();
      // print_format_list.unshift(default_print_format);
      // console.log(print_format_list)
      // return print_format_list;
    }
    return print_format_list;
  },
});

frappe.ui.form.on("Product Order", {
  setup: function (frm) {
    var print_format_list = [];
    let enable_raw_printing = frappe.model.get_doc(
      ":Print Settings",
      "Print Settings"
    ).enable_raw_printing;
    var print_formats = frappe
      .get_list("Print Format", { doc_type: frm.doc.doctype })
      .sort(function (a, b) {
        return a > b ? 1 : -1;
      });
    $.each(print_formats, function (i, d) {
      if (
        !in_list(print_format_list, d.name) &&
        d.print_format_type !== "JS" &&
        (cint(enable_raw_printing) || !d.raw_printing)
      ) {
        print_format_list.push(d.name);
      }
    });
    frm.set_df_property("print_format", "options", print_format_list);
  },
  onload: function (frm) {
    // set items to read only if sent to sap
    frm.page.sidebar.toggle(false);
    if (!cur_frm.doc.docstatus)
      frm.set_value("shift_employee", frappe.user.name);
    frm.doc.product_details.forEach((product) => {
      if (product.item_status == "Sent to SAP") product.docstatus = 1;
    });
    refresh_field("product_details");
  },

  generate: function (frm) {
    let items = parseInt(frm.doc.rolls_no);
    let index;
    if (frm.doc.product_details) index = frm.doc.product_details.length;
    else index = 0;

    for (let i = index; i < items + index; i++) {
      frm.add_child("product_details", {
        // row_no: `${frm.doc.document_no}-${i+1}`,
        ref: `${frm.doc.item_serial}-${frm.doc.length}-${frm.doc.width}`,
      });
    }
    frm.set_value("order_status", "In Progress");
    refresh_field("product_details");
  },

  update_item_waiting_quality: function (frm) {
    let items = frm.get_selected().product_details;

    if (!items) frappe.throw("Select items to be sent");

    items.forEach((item) => {

      if (locals["Product Order Details"][item].item_status == "Waiting Quality")
        frappe.throw("Some items already is Waiting Quality");
      else {
        frappe.call({
          method: "sap.api.update_item_waiting_quality",
          args: {
            name: locals["Product Order Details"][item].name,

          },
          callback:function(r){
            frappe.msgprint("Succesfuly Qc")
            frm.reload_doc();

          }
        });
      }
   
      frm.save().then(() => frm.trigger("reload"));

      //refresh_field("product_details");

    });

  },
  send_to_sap: function (frm) {
    is_doc_instantiated(frm);

    frappe.show_progress("Sending items to Sap..", 20, 100, "Please wait");

    let items = frm.get_selected().product_details;

    if (!items) frappe.throw("Select items to be sent");

    items.forEach((item) => {
      if (locals["Product Order Details"][item].item_status == "Sent to SAP")
        frappe.throw("Some items already sent to SAP");
    });
    frappe.call({
      async: false,
      method: "sap.api.send_product_to_sap",
      args: {
        product_name: frm.doc.name,
        items: JSON.stringify(items),
      },
      callback: function (r) {
        frappe.show_progress("Sending items to Sap..", 100, 100, "Please wait");
        frappe.hide_progress();
        if (!r.message.success) {
          frappe.throw(r.message.message);
        } else {
          for (let item of items) {
            frappe.model.set_value(
              "Product Order Details",
              item,
              "item_status",
              "Sent to SAP"
            );
          }
        }
      },
    });
    frm.save().then(() => frm.trigger("onload"));
  },
  print_selected_pallet: function (frm) {
    // stop here
    is_doc_instantiated(frm);
    if (!frm.doc.docstatus)
      frm.doc.product_details.forEach((product) => {
        frappe.model.set_value(
          "Product Order Details",
          product.name,
          "item_status",
          "Waiting Quality"
        );
      });

    let d = new frappe.ui.Dialog({
      title: "Enter Pallet Number",
      fields: [
        { label: "Pallet No", fieldname: "pallet_no", fieldtype: "Data" },
      ],
      primary_action_label: "Print",
      primary_action(values) {
        frm.doc.selected_pallet_no = values.pallet_no;
        print_selected_doc(frm);

        d.hide();
      },
    });

    d.show();
    function print_selected_doc(frm) {
      frm.doc.selected_product = [];
      let i = 1;
      frm.doc.product_details.forEach((product) => {
        if (product.pallet_no == frm.doc.selected_pallet_no) {
          frm.doc.selected_product.push({ ...product, idx: i });
          i += 1;
        }
      });
      frm.print_doc();
    }
  },
});

frappe.ui.form.on("Product Order Details", {
  measure: function (frm) {
    const options = {
      clean: true, // retain session
      connectTimeout: 3000, // Timeout period increased to 30 seconds
      // Authentication information
      // clientId: 'foobar_test_random' + Math.floor(Math.random() * 10000),
    };
    const connectUrl = "wss://test.mosquitto.org:8081";
    const client = mqtt.connect(connectUrl, options);

    //actually subscribe to something on a sucessfull connection
    client.on("connect", (connack) => {
      if (frm.selected_doc.scaler) client.subscribe(frm.selected_doc.scaler);
    });

    client.on("reconnect", (error) => {
      console.log("reconnecting:", error);
    });

    client.on("error", (error) => {
      console.log("Connection failed:", error);
    });

    client.on("message", (topic, message) => {
      frm.selected_doc.net_weight = message.toString();
      refresh_field("product_details");
      client.unsubscribe(frm.selected_doc.scaler);
    });
  },
  print_qr: function (frm) {
    // is_doc_instantiated(frm);
    let row = frm.selected_doc.idx;
    frappe.call({
      async: false,
      method: "sap.api.generate_qr",
      args: {
        data: {
          customer_no: frm.doc.customer_no,
          customer_name: frm.doc.customer_name,
          item_no: frm.doc.item_serial,
          product_no: frm.doc.item_no,
          net_weight: frm.selected_doc.net_weight,
          gross_weight: frm.selected_doc.gross_weight,
        },
      },
      callback: function (r) {
        frm.selected_doc.qr_code = r.message;
        refresh_field("product_details");
        if (
          frm.selected_doc.item_status !== "Inspected" &&
          !frm.selected_doc.docstatus
        ) {
          frappe.model
            .set_value(
              "Product Order Details",
              frm.selected_doc.name,
              "item_status",
              "Waiting Quality"
            )
            .then(() => {
              if (frm.doc.__unsaved == 1) {
                frm.save().then(() => {
                  print_product_details(frm, row);
                });
              } else {
                print_product_details(frm, row);
              }
            });
        } else {
          print_product_details(frm, row);
        }
      },
    });

    // frappe.call({
    //     method: 'sap.api.send_to_quality',
    //     args: {
    // 	'doc': frm.doc.name,
    // 	'row_no': frm.selected_doc.row_no,
    // 	'index': frm.selected_doc.idx
    //     },
    //     callback: function(r) {
    // 	console.log("done")
    //     }
    // })

    function print_product_details(frm, row) {
      frm.doc.selected_qr = frm.doc.product_details[row - 1].qr_code;
      frm.doc.selected_row = row - 1;
      // frm.doc.product_details[row-1].item_status = "Waiting Quality"
      frm.print_doc();
    }
  },

  qt_inspection: function (frm) {
    frappe.call({
      method: "frappe.client.get",
      args: {
        doctype: "Quality Inspection",
        name: frm.selected_doc.qt_inspection,
      },
      callback: function (r) {
        // frm.selected_doc.quality_status = r.message.status;
        frappe.model.set_value(
          "Product Order Details",
          frm.selected_doc.name,
          "quality_status",
          r.message.status
        );
        refresh_field("product_details");
      },
    });
  },
  get_indicator: function (frm) {
    return [
      __(frm.doc.product_details.quality_status),
      {
        Rejected: "red",
        Accepted: "green",
      }[frm.doc.product_details.quality_status],
      "quality_status,=," + frm.doc.product_details.quality_status,
    ];
  },
});

function is_doc_instantiated(frm) {
  // let name = frm.doc.name.split("-");
  if (frm.doc.__unsaved) frappe.throw("Save the Doc to generate qr code");
}
