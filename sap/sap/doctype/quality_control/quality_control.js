// Copyright (c) 2022, ahmed and contributors
// For license information, please see license.txt
frappe.provide("erpnext.public");
frappe.provide("erpnext.controllers");

// erpnext.quality_inspection = erpnext.quality_inspection.extends({
//     onload: function(frm) {
// 	console.log("hi")
//     }
// })

frappe.ui.form.on("Quality Inspection", {
  onload_post_render: function (frm) {
    if (frm.is_new() && frappe.get_prev_route()[1] == "Quality Control") {
      try {
        frm.set_value("item_code", frappe._from_link.doc.item_serial);
        frm.set_value("reference_type", "Product Order");
        frm.set_value("reference_name", frappe._from_link.doc.product_name);
      } catch (e) {}
    }
  },
  before_save: function (frm) {
    frappe.set_route("/app/quality-control");
  },
});

frappe.ui.form.on("Quality Control", {
  onload: function (frm) {
    frm.fields_dict["product_items"].grid.get_field("qt_inspection").get_query =
      function (doc, cdt, cdn) {
        var child = locals[cdt][cdn];
        return {
          filters: [["item_code", "=", child["item_serial"]]],
        };
      };
  },
  refresh: function (frm) {
    frappe.call({
      method: "sap.api.get_items_wait_quality",
      callback: function (r) {
        let items = r.message;
        // console.log("items", items);
        update_items_table(frm, items);
      },
    });
    frm.disable_save();
  },
  change_rolls_status: function (frm) {
    let d = new frappe.ui.Dialog({
      title: "Rolls Status",
      fields: [
        {
          label: "Select All Rows",
          fieldname: "select_all",
          fieldtype: "Button",
        },
        { fieldtype: "Column Break" },
        { label: "Range", fieldname: "range", fieldtype: "Button" },
        { fieldtype: "Column Break" },
        { label: "Custom Rows", fieldname: "custom_rows", fieldtype: "Button" },
        { fieldtype: "Column Break" },
        { label: "Pallet No", fieldname: "pallet_number", fieldtype: "Button" },
        { fieldtype: "Section Break" },
        {
          label: "From Row",
          fieldname: "from_row",
          fieldtype: "Int",
          description: "enter row number",
        },
        { label: "to Row", fieldname: "to_row", fieldtype: "Int" },
        {
          label: "Rows",
          fieldname: "rows",
          fieldtype: "Data",
          description: "enter row number separated by comma ex: 2,4",
          hidden: 1,
        },
        {
          label: "Pallet No",
          fieldname: "pallet_no",
          fieldtype: "Data",
          hidden: 1,
        },
        {
          label: "Status",
          fieldname: "row_status",
          fieldtype: "Select",
          options: ["", "Accepted", "Rejected"],
          reqd: 1,
        },
        {
          label: "",
          fieldname: "selected_but",
          fieldtype: "Data",
          hidden: 1,
          default_value: "range",
        },
      ],
      primary_action_label: "Submit",
      primary_action(values) {
        let items = frm.doc.product_items;

        if (values.selected_but == "custom_rows") {
          let rows = values.rows.split(",");
          try {
            for (let r of rows)
              update_quality(
                items[parseInt(r) - 1].item_name,
                values.row_status
              );
          } catch (e) {
            frappe.throw("Check row number");
          }
        } else if (values.selected_but == "pallet_number") {
          items.forEach((item) => {
            if (item.pallet_no == values.pallet_no)
              update_quality(item.item_name, values.row_status);
          });
        } else if (values.selected_but == "select_all") {
          items.forEach((item) =>
            update_quality(item.item_name, values.row_status)
          );
        } else {
          try {
            for (let i = values.from_row - 1; i < values.to_row; i++)
              update_quality(items[i].item_name, values.row_status);
          } catch (e) {
            frappe.throw("Check row numbers");
          }
        }

        d.hide();
        frm.reload_doc();
      },
    });
    d.fields_dict["select_all"].onclick = () => {
      cur_dialog.set_df_property("from_row", "hidden", 1);
      cur_dialog.set_df_property("to_row", "hidden", 1);
      cur_dialog.set_df_property("pallet_no", "hidden", 1);
      cur_dialog.set_df_property("rows", "hidden", 1);
      cur_dialog.fields_dict["selected_but"].set_value("select_all");
    };
    d.fields_dict["range"].onclick = () => {
      cur_dialog.set_df_property("from_row", "hidden", 0);
      cur_dialog.set_df_property("to_row", "hidden", 0);
      cur_dialog.set_df_property("pallet_no", "hidden", 1);
      cur_dialog.set_df_property("rows", "hidden", 1);
      cur_dialog.fields_dict["selected_but"].set_value("range");
    };
    d.fields_dict["custom_rows"].onclick = () => {
      cur_dialog.set_df_property("from_row", "hidden", 1);
      cur_dialog.set_df_property("to_row", "hidden", 1);
      cur_dialog.set_df_property("pallet_no", "hidden", 1);
      cur_dialog.set_df_property("rows", "hidden", 0);
      cur_dialog.fields_dict["selected_but"].set_value("custom_rows");
    };
    d.fields_dict["pallet_number"].onclick = () => {
      cur_dialog.set_df_property("from_row", "hidden", 1);
      cur_dialog.set_df_property("to_row", "hidden", 1);
      cur_dialog.set_df_property("pallet_no", "hidden", 0);
      cur_dialog.set_df_property("rows", "hidden", 1);
      cur_dialog.fields_dict["selected_but"].set_value("pallet_number");
    };
    d.show();
  },
  clear_filter: function (frm) {
    frm.reload_doc();
  },
  filter: function (frm) {
    let d = new frappe.ui.Dialog({
      title: "Filter Items",
      fields: [
        { label: "Date", fieldtype: "Section Break" },
        { label: "Start Date", fieldname: "start_date", fieldtype: "Date" },
        { fieldtype: "Column Break" },
        { label: "End Date", fieldname: "end_date", fieldtype: "Date" },
        { fieldtype: "Section Break" },
        { label: "Document No", fieldname: "document_no", fieldtype: "Data" },
        { label: "Pallet Number", fieldname: "pallet_no", fieldtype: "Data" },
        { label: "Item Serial", fieldname: "item_serial", fieldtype: "Data" },
      ],
      primary_action_label: "Filter",
      primary_action(values) {
        if (new Date(values.end_date) < new Date(values.start_date))
          frappe.throw("End Date can't be earlier that Start Date");
        frappe.call({
          method: "sap.api.get_items_wait_quality",
          args: {
            pallet_no: values.pallet_no || "",
            start_date: values.start_date || "",
            end_date: values.end_date || "",
            item_serial: values.item_serial || "",
            document_no: values.document_no || "",
          },
          callback: function (r) {
            let items = r.message;
            update_items_table(frm, items);
          },
        });
        d.hide();
      },
    });
    d.show();
  },
});

frappe.ui.form.on("Quality Control Details", {
  quality_status: function (frm) {
    frappe.call({
      method: "sap.api.update_item_quality",
      args: {
        name: frm.selected_doc.item_name,
        status: frm.selected_doc.quality_status,
        qt_inspection: frm.selected_doc.qt_inspection || "",
      },
    });
    frm.reload_doc();
  },
  qt_inspection: function (frm) {
    if (frm.selected_doc.qt_inspection) {
      frappe.call({
        method: "frappe.client.get",
        args: {
          doctype: "Quality Inspection",
          name: frm.selected_doc.qt_inspection,
        },
        callback: function (r) {
          frappe.model.set_value(
            "Quality Control Details",
            frm.selected_doc.name,
            "quality_status",
            r.message.status
          );
          refresh_field("product_items");
        },
      });
      frm.reload_doc();
    }
  },
});

function update_quality(name, status, qt_inspection = "") {
  frappe.call({
    method: "sap.api.update_item_quality",
    args: {
      name: name,
      status: status,
      qt_inspection: qt_inspection,
    },
  });
}

function update_items_table(frm, items) {
  frm.doc.product_items = [];
  items.forEach((item) => {
    // console.log(item);
    frm.add_child("product_items", {
      pallet_no: item.pallet_no,
      gross_weight: item.total_weight,
      net_weight: item.net_weight,
      item_status: item.item_status,
      document_no: item.document_no,
      item_group: item.item_group,
      customer_no: item.customer_no,
      customer_name: item.customer_name,
      product_quantity: item.quantity,
      product_length: item.length,
      product_width: item.width,
      item_serial: item.item_serial,
      product_weight: item.weight,
      product_thickness: item.thickness,
      product_core_type: item.core_type,
      product_core_weight: item.core_weight,
      product_total_weight: item.total_weight,
      application: item.application,
      item_name: item.name,
      product_name: item.product_name,
    });
  });
  refresh_field("product_items");
}
