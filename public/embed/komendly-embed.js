/* Komendly "Make ads from your website" widget. Replaces <div data-komendly-embed data-partner="your-tag"> with an
   iframe. Collects nothing itself: the form inside opens komendly.com/free-ads in a new tab. */
(function () {
  var origin = "https://www.komendly.com";
  var nodes = document.querySelectorAll("[data-komendly-embed]");
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (el.getAttribute("data-komendly-ready")) continue;
    el.setAttribute("data-komendly-ready", "1");
    var tag = (el.getAttribute("data-partner") || "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(tag)) tag = "embed";
    var f = document.createElement("iframe");
    f.src = origin + "/embed/ads?p=" + encodeURIComponent(tag);
    f.title = "Make ads from your website";
    f.loading = "lazy";
    f.style.cssText = "border:0;width:100%;max-width:520px;height:230px";
    el.appendChild(f);
  }
})();
