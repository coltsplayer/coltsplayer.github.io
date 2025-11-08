// charts.js - wrappers for Chart.js
export function renderBudgetChart(canvas, dataByCat){
  if(!canvas) return;
  const labels = Object.keys(dataByCat);
  const values = labels.map(l=>dataByCat[l]||0);
  if(window._budgetChart) window._budgetChart.destroy();
  window._budgetChart = new Chart(canvas.getContext("2d"), { type:"bar", data:{labels, datasets:[{label:"Amount", data:values}] }, options:{plugins:{legend:{display:false}}}});
}
