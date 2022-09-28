// Copyright (c) 2022, ahmed and contributors
// For license information, please see license.txt

frappe.ui.form.on("QC Integration", {
    onload(frm) {
	let c = 0;
	frm.doc.batch_numbers.forEach((batch) => {
	    if (batch.item_status == "Sent to SAP") {
		batch.docstatus = 1;
		c += 1;
	    }
	});
	refresh_field("batch_numbers");
	
	if(c == frm.doc.batch_numbers.length && frm.doc.status != "Finished") {
	    frm.set_value("status", "Finished").then(() => frm.save().then(() => frm.trigger('onload')));
	}
	    
	// } else if(c > 0) {
	//     frm.set_value("status", "Under Progress").then(() => frm.save());
	// }

      frm.fields_dict["batch_numbers"].grid.get_field("inspection").get_query =
	  function (doc, cdt, cdn) {
              return {
		  filters: [["item_code", "=", frm.doc.item_code]],
              };
	  };
  },
  send_to_sap(frm) {
    let items = frm.get_selected().batch_numbers;

    if (!items) frappe.throw("Select items to be sent");

    items.forEach((item) => {
      if (locals["QC Integration Details"][item].item_status == "Sent to SAP")
        frappe.throw("Some items already sent to SAP");
    });

      frappe.show_progress("Sending items to Sap..", 100, 100, "Please wait");

    frappe.call({
      async: false,
      method: "sap.api.send_qc_to_sap",
      args: {
        items: JSON.stringify(items),
      },
      callback: function (r) {
        frappe.hide_progress();
        if (r.message.success) {
          for (let item of items) {
            frappe.model.set_value(
              "QC Integration Details",
              item,
              "item_status",
              "Sent to SAP"
            );
          }
        } else {
          frappe.throw("SAP Error");
        }
      },
    });
    frm.save().then(() => frm.trigger("onload"));
  },
});

frappe.ui.form.on("QC Integration Details", {
    inspection(frm) {
	if (frm.selected_doc.inspection) {
	    frappe.call({
		method: "frappe.client.get",
		args: {
		    doctype: "Quality Inspection",
		    name: frm.selected_doc.inspection,
		},
		callback: function (r) {
		    frappe.model.set_value(
			"QC Integration Details",
			frm.selected_doc.name,
			"status",
			r.message.qc_status
		    );
		    refresh_field("batch_numbers");
		},
	    });
	    frm.reload_doc();
	}
    },
    status(frm) {
	frm.set_value("status", "Under Progress");
    }
});

frappe.ui.form.on("Quality Inspection", {
  onload_post_render: function (frm) {
    if (frm.is_new() && frappe.get_prev_route()[1] == "QC Integration") {
      try {
          frm.set_value("item_code", frappe._from_link.doc.item_code);
          frm.set_value("reference_type", "QC Integration");
	  frm.set_value("reference_name", frappe._from_link.doc.name);
      } catch (e) {}
    }
  },
  before_save: function (frm) {
    frappe.set_route("/app/qc-integration");
  },
});
