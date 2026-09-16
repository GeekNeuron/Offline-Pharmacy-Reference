(function () {
  "use strict";

  var STORAGE_KEY = "pharmacy_invoice_selection";
  var EXTRA_ROWS = 5;

  var digitMap = { "0": "۰", "1": "۱", "2": "۲", "3": "۳", "4": "۴", "5": "۵", "6": "۶", "7": "۷", "8": "۸", "9": "۹" };
  var reverseDigitMap = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };

  function toPersianDigits(input) {
    return String(input).replace(/[0-9]/g, function (d) { return digitMap[d]; });
  }

  function parseNumber(str) {
    if (!str) return 0;
    var ascii = String(str).replace(/[۰-۹]/g, function (d) { return reverseDigitMap[d]; }).replace(/[^\d.]/g, "");
    var n = parseFloat(ascii);
    return isNaN(n) ? 0 : n;
  }

  function formatNumber(n) {
    var rounded = Math.round(n);
    return toPersianDigits(rounded.toLocaleString("en-US"));
  }

  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function loadSelection() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function buildRow(name, qty, price, editableName) {
    var nameCell = editableName
      ? '<td class="drug-name-cell" contenteditable="true" data-placeholder=""></td>'
      : '<td class="drug-name-cell">' + escapeHtml(name) + '</td>';
    return (
      '<tr>' +
      '<td class="row-num"></td>' +
      nameCell +
      '<td contenteditable="true">' + qty + '</td>' +
      '<td contenteditable="true">' + price + '</td>' +
      '<td class="row-total-cell">۰</td>' +
      '</tr>'
    );
  }

  function renumberRows(tbody) {
    var n = 0;
    var rows = tbody.querySelectorAll("tr");
    rows.forEach(function (row) {
      var nameCell = row.querySelector(".drug-name-cell");
      var numCell = row.querySelector(".row-num");
      var hasName = nameCell && nameCell.textContent.trim();
      if (hasName) {
        n++;
        numCell.textContent = toPersianDigits(n);
      } else {
        numCell.textContent = "";
      }
    });
  }

  function recalcRow(row) {
    var editableCells = row.querySelectorAll("td[contenteditable]");
    var qtyCell = null, priceCell = null;
    editableCells.forEach(function (c) {
      if (!c.classList.contains("drug-name-cell")) {
        if (qtyCell === null) qtyCell = c;
        else if (priceCell === null) priceCell = c;
      }
    });
    var totalCell = row.querySelector(".row-total-cell");
    if (!qtyCell || !priceCell || !totalCell) return;
    var qty = parseNumber(qtyCell.textContent);
    var price = parseNumber(priceCell.textContent);
    totalCell.textContent = formatNumber(qty * price);
    recalcGrandTotal();
  }

  function recalcGrandTotal() {
    var sum = 0;
    document.querySelectorAll(".row-total-cell").forEach(function (cell) {
      sum += parseNumber(cell.textContent);
    });
    var el = document.getElementById("grand-total");
    if (el) el.textContent = formatNumber(sum) + " ریال";
  }

  function wireRow(row) {
    var nameCell = row.querySelector(".drug-name-cell");
    var editableCells = row.querySelectorAll("td[contenteditable]");
    var qtyCell = null, priceCell = null;
    editableCells.forEach(function (c) {
      if (!c.classList.contains("drug-name-cell")) {
        if (qtyCell === null) qtyCell = c;
        else if (priceCell === null) priceCell = c;
      }
    });

    if (nameCell && nameCell.hasAttribute("contenteditable")) {
      nameCell.addEventListener("input", function () {
        var tbody = document.getElementById("items-body");
        if (nameCell.textContent.trim()) {
          if (qtyCell && !qtyCell.textContent.trim()) qtyCell.textContent = "۱";
          if (priceCell && !priceCell.textContent.trim()) priceCell.textContent = "۰";
        }
        renumberRows(tbody);
        recalcRow(row);
      });
    }

    if (qtyCell) qtyCell.addEventListener("input", function () { recalcRow(row); });
    if (priceCell) priceCell.addEventListener("input", function () { recalcRow(row); });
  }

  function init() {
    var tbody = document.getElementById("items-body");
    var selection = loadSelection();
    var html = "";

    selection.forEach(function (item) {
      var name = item.name || "";
      html += buildRow(name, "۱", "۰", false);
    });

    for (var i = 0; i < EXTRA_ROWS; i++) {
      html += buildRow("", "", "", true);
    }

    tbody.innerHTML = html;
    renumberRows(tbody);
    tbody.querySelectorAll("tr").forEach(wireRow);
    recalcGrandTotal();

    var printBtn = document.getElementById("print-btn");
    if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
