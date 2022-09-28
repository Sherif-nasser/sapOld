frappe.listview_settings["Product Order"] = {
  add_fields: ["product_status"],
  set_indicator: function (doc) {
    return [
      __(doc.status),
      {
        "New": "red",
        "Finished": "blue",
        "In Progress": "green",
      }[doc.product_status],
      "Product Status,=," + doc.product_status,
    ];
  },
  onload: function (listview) {
    listview.page.add_inner_button(__("Get Finished Products"), function () {
      frappe.show_progress("Getting items from Sap..", 20, 100, "Please wait");
      frappe.call({
        method: "sap.api.get_products_from_sap",
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
