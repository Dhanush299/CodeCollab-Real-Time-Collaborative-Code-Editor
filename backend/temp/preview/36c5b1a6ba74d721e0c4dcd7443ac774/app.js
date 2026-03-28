console.log("app.js loaded");

const title = document.getElementById("title");
const btn = document.getElementById("btn");

title.textContent = "HTML + CSS + JS loaded OK";

btn.addEventListener("click", () => {
  console.log("button clicked");
  title.textContent = "Clicked!";
  document.body.style.background = "#dcfce7";
});