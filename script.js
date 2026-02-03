function calculate() {
  const x = parseFloat(document.getElementById('x').value);
  const y = parseFloat(document.getElementById('y').value);
  const z = parseFloat(document.getElementById('z').value);
  const dim = document.getElementById('dimension').value;

  if (isNaN(x) || isNaN(y) || isNaN(z)) {
    document.getElementById('output').innerText = "Please enter valid coordinates.";
    return;
  }

  let nx, nz;

  if (dim === "overworld") {
    nx = x / 8;
    nz = z / 8;
  } else {
    nx = x * 8;
    nz = z * 8;
  }

  document.getElementById('output').innerText =
    `Converted Coordinates: X=${nx.toFixed(2)}, Z=${nz.toFixed(2)}`;
}
