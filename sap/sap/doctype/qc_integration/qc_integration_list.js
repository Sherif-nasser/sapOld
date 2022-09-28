frappe.listview_settings["QC Integration"] = {   
    onload: function (listview) {
	listview.page.add_inner_button(__("Get QC Products"), function () {
	    frappe.show_progress("Getting items from Sap..", 20, 100, "Please wait");
	    frappe.call({
		method: "sap.api.get_qc_from_sap",
		args: { progress: true },
		callback: function (r) {
		    frappe.show_progress(
			"Getting items from Sap..",
			100,
			100,
			"Please wait"
		    );
		    frappe.hide_progress();
		    if (r.message.success) {
			frappe.show_alert(
			    {
				message: __("Sync done successfully"),
				indicator: "green",
			    },
			    5
			);
		    } else {
			frappe.show_alert(
			    {
				message: __("Something wrong happened"),
				indicator: "red",
			    },
			    5
			);
		    }
		},
	    });
	});
    },
};
