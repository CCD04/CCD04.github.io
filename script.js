// ---- Config & Data Model ----

const STORAGE_KEY = "portalListData_v1";

const WORLD_OVERWORLD = "Overworld";
const WORLD_NETHER = "Nether";

let portals = [];
let topWorld = WORLD_OVERWORLD;

// ---- Portal Factory & Sanitization ----

function createBlankPortal() {
  return {
    name: "",
    destination: "",
    x: null,
    y: null,
    z: null,
    world: WORLD_OVERWORLD,
    travel: { x: null, y: null, z: null, world: null },
    closest: { name: null, distance: null },
    target: { name: null, distance: null },
  };
}

function sanitizePortal(raw) {
  try {
    return {
      name: typeof raw.name === "string" ? raw.name : "",
      destination: typeof raw.destination === "string" ? raw.destination : "",
      x: Number.isFinite(raw.x) ? raw.x : null,
      y: Number.isFinite(raw.y) ? raw.y : null,
      z: Number.isFinite(raw.z) ? raw.z : null,
      world: raw.world === WORLD_NETHER ? WORLD_NETHER : WORLD_OVERWORLD,
      travel: raw.travel || { x: null, y: null, z: null, world: null },
      closest: raw.closest || { name: null, distance: null },
      target: raw.target || { name: null, distance: null },
    };
  } catch (err) {
    console.warn("Portal data corrupted, resetting portal:", err);
    return createBlankPortal();
  }
}

// ---- Storage ----

function loadPortalsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    return parsed.map(sanitizePortal);
  } catch (err) {
    console.error("Failed to load or parse portal data:", err);
    return null;
  }
}

function savePortalsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portals));
  } catch (err) {
    console.error("Failed to save portal data:", err);
  }
}

function initializePortals() {
  const stored = loadPortalsFromStorage();

  if (stored && stored.length > 0) {
    portals = stored;
  } else {
    portals = [createBlankPortal()];
    savePortalsToStorage();
  }
}

// ---- Math Helpers ----

function convertCoords(x, z, fromWorld, toWorld) {
  if (x == null || z == null) return { x: null, z: null };

  // Overworld → Nether uses FLOOR
  if (fromWorld === WORLD_OVERWORLD && toWorld === WORLD_NETHER) {
    return {
      x: Math.floor(x / 8),
      z: Math.floor(z / 8),
    };
  }

  // Nether → Overworld uses multiply
  if (fromWorld === WORLD_NETHER && toWorld === WORLD_OVERWORLD) {
    return {
      x: x * 8,
      z: z * 8,
    };
  }

  return { x, z };
}

function distance3D(x1, y1, z1, x2, y2, z2) {
  if ([x1, y1, z1, x2, y2, z2].some((v) => v == null)) return null;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}


// ---- Calculations per Portal ----

function computePortalTravelLocation(portal) {
  const { x, y, z, world } = portal;

  if (x == null || y == null || z == null) {
    portal.travel = { x: null, y: null, z: null, world: null };
    return;
  }

  const targetWorld =
    world === WORLD_OVERWORLD ? WORLD_NETHER : WORLD_OVERWORLD;

  const converted = convertCoords(x, z, world, targetWorld);

  portal.travel = {
    x: converted.x,
    y: y,
    z: converted.z,
    world: targetWorld,
  };
}

function computeClosestPortal(portal, index) {
  const travel = portal.travel;

  if (!travel || travel.x == null || travel.z == null) {
    portal.closest = { name: null, distance: null };
    return;
  }

  const targetWorld = travel.world;
  const maxRange = (targetWorld === WORLD_NETHER) ? 16 : 128;

  let best = null;
  let bestDist = Infinity;

  portals.forEach((other, i) => {
    if (i === index) return;
    if (other.world !== targetWorld) return;
    if (other.x == null || other.z == null) return;

    // ---- STEP 1: Horizontal reachability (Minecraft-accurate) ----
    const dx = Math.abs(other.x - travel.x);
    const dz = Math.abs(other.z - travel.z);

    // If outside the square search region → unreachable
    if (dx > maxRange || dz > maxRange) return;

    // ---- STEP 2: 3D distance for closest selection ----
    const d3 = distance3D(
      travel.x, travel.y, travel.z,
      other.x, other.y, other.z
    );

    if (d3 == null) return;

    if (d3 < bestDist) {
      bestDist = d3;
      best = other;
    }
  });

  portal.closest = best
    ? { name: best.name || "(unnamed)", distance: bestDist }
    : { name: null, distance: null };
}



function computeTargetPortal(portal) {
  if (!portal.destination) {
    portal.target = { name: null, distance: null };
    return;
  }

  const target = portals.find((p) => p.name === portal.destination);

  if (!target || target.x == null || target.z == null) {
    portal.target = { name: null, distance: null };
    return;
  }

  // ---- STEP 1: Travel coords must exist ----
  const travel = portal.travel;
  if (!travel || travel.x == null || travel.z == null) {
    portal.target = { name: target.name, distance: "Cannot Reach" };
    return;
  }

  // ---- STEP 2: Must be same world (travel.world vs target.world) ----
  if (travel.world !== target.world) {
    portal.target = { name: target.name, distance: "Cannot Reach" };
    return;
  }

  // ---- STEP 3: Horizontal reachability ----
  const dx = Math.abs(target.x - travel.x);
  const dz = Math.abs(target.z - travel.z);

  const maxRange = (travel.world === WORLD_NETHER) ? 16 : 128;

  if (dx > maxRange || dz > maxRange) {
    portal.target = { name: target.name, distance: "Cannot Reach" };
    return;
  }

  // ---- STEP 4: 3D distance ----
  const d3 = distance3D(
    travel.x, travel.y, travel.z,
    target.x, target.y, target.z
  );

  portal.target = {
    name: target.name,
    distance: d3
  };
}

// ---- Output Card ----

function updateOutputCard() {
  const outX = document.getElementById("outX");
  const outY = document.getElementById("outY");
  const outZ = document.getElementById("outZ");
  const outWorld = document.getElementById("outWorld");

  const closestName = document.getElementById("closestName");
  const closestDistance = document.getElementById("closestDistance");

  const targetName = document.getElementById("targetName");
  const targetDistance = document.getElementById("targetDistance");

  const topXInput = document.getElementById("top-x");
  const topYInput = document.getElementById("top-y");
  const topZInput = document.getElementById("top-z");
  const topDestInput = document.getElementById("top-destination");

  if (
    !outX || !outY || !outZ || !outWorld ||
    !closestName || !closestDistance ||
    !targetName || !targetDistance ||
    !topXInput || !topYInput || !topZInput || !topDestInput
  ) {
    return;
  }

  const x = Number(topXInput.value);
  const y = Number(topYInput.value);
  const z = Number(topZInput.value);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    outX.textContent = "—";
    outY.textContent = "—";
    outZ.textContent = "—";
    outWorld.textContent = "—";
    closestName.textContent = "—";
    closestDistance.textContent = "—";
    targetName.textContent = "—";
    targetDistance.textContent = "—";
    return;
  }

  // Determine converted coords for closest-portal search
  const targetWorld =
    topWorld === WORLD_OVERWORLD ? WORLD_NETHER : WORLD_OVERWORLD;
  const converted = convertCoords(x, z, topWorld, targetWorld);

  outX.textContent = converted.x;
  outY.textContent = y;
  outZ.textContent = converted.z;
  outWorld.textContent = targetWorld;

  // ---- CLOSEST PORTAL (correct & working) ----
  let best = null;
  let bestDist = Infinity;
  const maxRangeClosest = (targetWorld === WORLD_NETHER) ? 16 : 128;

  portals.forEach((p) => {
    if (p.world !== targetWorld) return;
    if (p.x == null || p.z == null) return;

    const dx = Math.abs(p.x - converted.x);
    const dz = Math.abs(p.z - converted.z);
    if (dx > maxRangeClosest || dz > maxRangeClosest) return;

    const d3 = distance3D(converted.x, y, converted.z, p.x, p.y, p.z);
    if (d3 == null) return;

    if (d3 < bestDist) {
      bestDist = d3;
      best = p;
    }
  });

  closestName.textContent = best ? best.name || "(unnamed)" : "Cannot Reach";
  closestDistance.textContent = best ? bestDist.toFixed(2) : "—";

  // ---- TARGET PORTAL ----
  const destName = topDestInput.value;
  const target = portals.find((p) => p.name === destName);

  if (!target || target.x == null || target.z == null) {
    targetName.textContent = "—";
    targetDistance.textContent = "—";
    return;
  }

  // STEP 1: Must be same world (travel world vs target world)
  if (target.world !== targetWorld) {
    targetName.textContent = target.name;
    targetDistance.textContent = "Cannot Reach";
    return;
  }

  // STEP 2: Horizontal reachability using TRAVEL COORDS
  const dxT = Math.abs(target.x - converted.x);
  const dzT = Math.abs(target.z - converted.z);
  const maxRangeTarget = (targetWorld === WORLD_NETHER) ? 16 : 128;

  if (dxT > maxRangeTarget || dzT > maxRangeTarget) {
    targetName.textContent = target.name;
    targetDistance.textContent = "Cannot Reach";
    return;
  }

  // STEP 3: 3D distance using TRAVEL COORDS
  const dT = distance3D(
    converted.x, y, converted.z,
    target.x, target.y, target.z
  );

  targetName.textContent = target.name;
  targetDistance.textContent = dT.toFixed(2);

}


// ---- Portal Card Display Updates ----

function updatePortalCardDisplays() {
  const container = document.getElementById("portalList");
  if (!container) return;

  const cards = container.querySelectorAll(".portal-card");

  cards.forEach((card, index) => {
    const portal = portals[index];
    if (!portal) return;

    const travelSpan = card.querySelector(".travel-loc");
    if (travelSpan) {
      if (!portal.travel || portal.travel.x == null) {
        travelSpan.textContent = "— / — / — (—)";
      } else {
        travelSpan.textContent = `${portal.travel.x} / ${portal.travel.y} / ${portal.travel.z} (${portal.travel.world})`;
      }
    }

    const closestSpan = card.querySelector(".closest-info");
    if (closestSpan) {
      if (!portal.closest || portal.closest.name == null) {
        closestSpan.textContent = "— (—)";
      } else {
        closestSpan.textContent = `${portal.closest.name} (${portal.closest.distance.toFixed(
          2
        )})`;
      }
    }
    // ---- Target Display ----
    const targetSpan = card.querySelector(".target-info");
    if (targetSpan) {
    if (!portal.target || portal.target.name == null) {
        targetSpan.textContent = "— (—)";
    } else if (portal.target.distance === "Cannot Reach") {
        targetSpan.textContent = `${portal.target.name} (Cannot Reach)`;
    } else {
        targetSpan.textContent = `${portal.target.name} (${portal.target.distance.toFixed(2)})`;
    }
    }

  });
}

// ---- Global Calculation Dispatcher ----

function updateAllPortalCalculations() {
  try {
    portals.forEach((portal) => computePortalTravelLocation(portal));
    portals.forEach((portal, index) => computeClosestPortal(portal, index));
    portals.forEach((portal) => computeTargetPortal(portal));

    savePortalsToStorage();
    updatePortalCardDisplays();
    updateOutputCard();
  } catch (err) {
    console.error("Calculation update failed:", err);
  }
}

// ---- Rendering ----

function renderPortalList() {
  const container = document.getElementById("portalList");
  if (!container) {
    console.error("portalList container missing from DOM");
    return;
  }

  container.innerHTML = "";

  portals.forEach((portal, index) => {
    const card = createPortalCard(portal, index);
    container.appendChild(card);
  });

  updateAllPortalCalculations();
  // Add Portal Button under the list
  const addBtn = document.createElement("button");
  addBtn.className =
    "mt-6 bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-xl " +
    "px-6 py-3 text-gray-200 hover:bg-gray-700 transition font-medium";
  addBtn.textContent = "+ Add Portal";

  addBtn.addEventListener("click", () => {
    portals.push(createBlankPortal());
    savePortalsToStorage();
    renderPortalList();
});

container.appendChild(addBtn);

}

function createPortalCard(portal, index) {
  const wrapper = document.createElement("div");
  wrapper.className = "relative w-full";

  const card = document.createElement("div");
  card.className =
    "portal-card bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-xl p-4 pl-10 pr-10 shadow-lg w-full " +
    "min-w-[1100px] grid grid-cols-[110px_110px_320px_125px_175px_175px] items-center gap-8";


  card.appendChild(buildPortalNameInput(portal, index));
  card.appendChild(buildDestinationInput(portal, index));
  card.appendChild(buildLocationInputs(portal, index));
  card.appendChild(buildTravelLocDisplay());
  card.appendChild(buildClosestDisplay());
  card.appendChild(buildTargetDisplay());


  wrapper.appendChild(card);
  wrapper.appendChild(buildMoveButtons(index));
  wrapper.appendChild(buildDeleteButton(index));

  return wrapper;
}

function buildPortalNameInput(portal, index) {
  const container = document.createElement("div");
  container.className = "flex flex-col";

  const label = document.createElement("label");
  label.className = "text-gray-400 text-xs";
  label.textContent = "Portal Name";

  const input = document.createElement("input");
  input.type = "text";
  input.value = portal.name || "";
  input.className =
    "bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-gray-100 w-32 " +
    "focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none";

  input.addEventListener("input", () => {
    portals[index].name = input.value;
    savePortalsToStorage();
    updateAllPortalCalculations();
  });

  container.appendChild(label);
  container.appendChild(input);
  return container;
}

function buildDestinationInput(portal, index) {
  const container = document.createElement("div");
  container.className = "flex flex-col";

  const label = document.createElement("label");
  label.className = "text-gray-400 text-xs";
  label.textContent = "Destination";

  const input = document.createElement("input");
  input.type = "text";
  input.value = portal.destination || "";
  input.className =
    "bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-gray-100 w-32 " +
    "focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none";

  input.addEventListener("input", () => {
    portals[index].destination = input.value;
    savePortalsToStorage();
    updateAllPortalCalculations();
  });

  container.appendChild(label);
  container.appendChild(input);
  return container;
}

function buildLocationInputs(portal, index) {
  const container = document.createElement("div");
  container.className = "flex flex-col";

  const label = document.createElement("label");
  label.className = "text-gray-400 text-xs";
  label.textContent = "Portal Loc";

  const row = document.createElement("div");
  row.className = "flex flex-row gap-2";

  const xInput = document.createElement("input");
  xInput.type = "number";
  xInput.value = portal.x ?? "";
  xInput.className =
    "bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-gray-100 w-16 " +
    "focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none";

  xInput.addEventListener("input", () => {
    portals[index].x = xInput.value === "" ? null : Number(xInput.value);
    savePortalsToStorage();
    updateAllPortalCalculations();
  });

  const yInput = document.createElement("input");
  yInput.type = "number";
  yInput.value = portal.y ?? "";
  yInput.className =
    "bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-gray-100 w-16 " +
    "focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none";

  yInput.addEventListener("input", () => {
    portals[index].y = yInput.value === "" ? null : Number(yInput.value);
    savePortalsToStorage();
    updateAllPortalCalculations();
  });

  const zInput = document.createElement("input");
  zInput.type = "number";
  zInput.value = portal.z ?? "";
  zInput.className =
    "bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-gray-100 w-16 " +
    "focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none";

  zInput.addEventListener("input", () => {
    portals[index].z = zInput.value === "" ? null : Number(zInput.value);
    savePortalsToStorage();
    updateAllPortalCalculations();
  });

  const worldSelect = document.createElement("select");
  worldSelect.className =
    "bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-gray-100 " +
    "focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none";

  worldSelect.innerHTML = `
    <option ${portal.world === WORLD_OVERWORLD ? "selected" : ""}>Overworld</option>
    <option ${portal.world === WORLD_NETHER ? "selected" : ""}>Nether</option>
  `;

  worldSelect.addEventListener("change", () => {
    portals[index].world = worldSelect.value;
    savePortalsToStorage();
    updateAllPortalCalculations();
  });

  row.appendChild(xInput);
  row.appendChild(yInput);
  row.appendChild(zInput);
  row.appendChild(worldSelect);

  container.appendChild(label);
  container.appendChild(row);
  return container;
}

function buildTravelLocDisplay() {
  const container = document.createElement("div");
  container.className = "flex flex-col";

  const label = document.createElement("label");
  label.className = "text-gray-400 text-xs";
  label.textContent = "Travel Loc";

  const span = document.createElement("span");
  span.className = "travel-loc text-gray-100";
  span.textContent = "— / — / — (—)";

  container.appendChild(label);
  container.appendChild(span);

  return container;
}

function buildTargetDisplay() {
  const container = document.createElement("div");
  container.className = "flex flex-col";

  const label = document.createElement("label");
  label.className = "text-gray-400 text-xs";
  label.textContent = "Target";

  const span = document.createElement("span");
  span.className = "target-info text-gray-100";
  span.textContent = "— (—)";

  container.appendChild(label);
  container.appendChild(span);

  return container;
}

function buildClosestDisplay() {
  const container = document.createElement("div");
  container.className = "flex flex-col";

  const label = document.createElement("label");
  label.className = "text-gray-400 text-xs";
  label.textContent = "Closest";

  const span = document.createElement("span");
  span.className = "closest-info text-gray-100";
  span.textContent = "— (—)";

  container.appendChild(label);
  container.appendChild(span);

  return container;
}

function buildMoveButtons(index) {
  const container = document.createElement("div");
  container.className = "absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1";

  // Up button
  const upBtn = document.createElement("button");
  upBtn.className =
    "text-gray-400 hover:text-purple-300 px-2 leading-none";
  upBtn.textContent = "↑";
  upBtn.addEventListener("click", () => movePortalUp(index));

  // Down button
  const downBtn = document.createElement("button");
  downBtn.className =
    "text-gray-400 hover:text-purple-300 px-2 leading-none";
  downBtn.textContent = "↓";
  downBtn.addEventListener("click", () => movePortalDown(index));

  container.appendChild(upBtn);
  container.appendChild(downBtn);
  return container;
}


function buildDeleteButton(index) {
  const btn = document.createElement("button");
  btn.className =
    "absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-300 px-2";
  btn.textContent = "X";

  btn.addEventListener("click", () => {
    deletePortal(index);
  });

  return btn;
}

// ---- Move & Delete ----

function deletePortal(index) {
  try {
    portals.splice(index, 1);

    if (portals.length === 0) {
      portals.push(createBlankPortal());
    }

    savePortalsToStorage();
    renderPortalList();
  } catch (err) {
    console.error("Failed to delete portal:", err);
  }
}

function movePortalUp(index) {
  if (index <= 0) return;
  [portals[index - 1], portals[index]] = [portals[index], portals[index - 1]];
  savePortalsToStorage();
  renderPortalList();
}

function movePortalDown(index) {
  if (index >= portals.length - 1) return;
  [portals[index], portals[index + 1]] = [portals[index + 1], portals[index]];
  savePortalsToStorage();
  renderPortalList();
}


// ---- Top Input World Toggle ----

function setupTopWorldButtons() {
  const overworldBtn = document.getElementById("top-overworldBtn");
  const netherBtn = document.getElementById("top-netherBtn");

  if (!overworldBtn || !netherBtn) {
    console.warn("Top world buttons missing from DOM");
    return;
  }

  overworldBtn.addEventListener("click", () => {
    topWorld = WORLD_OVERWORLD;
    updateTopWorldUI();
    updateOutputCard();
  });

  netherBtn.addEventListener("click", () => {
    topWorld = WORLD_NETHER;
    updateTopWorldUI();
    updateOutputCard();
  });

  updateTopWorldUI();
}

function updateTopWorldUI() {
  const overworldBtn = document.getElementById("top-overworldBtn");
  const netherBtn = document.getElementById("top-netherBtn");

  if (!overworldBtn || !netherBtn) return;

  overworldBtn.classList.toggle(
    "bg-purple-700",
    topWorld === WORLD_OVERWORLD
  );
  overworldBtn.classList.toggle("text-white", topWorld === WORLD_OVERWORLD);

  netherBtn.classList.toggle("bg-purple-700", topWorld === WORLD_NETHER);
  netherBtn.classList.toggle("text-white", topWorld === WORLD_NETHER);
}

// ---- Add Portal From Top Inputs (Convert Button repurposed) ----

function setupConvertButton() {
  const btn = document.getElementById("top-convertBtn");
  if (!btn) {
    console.warn("Convert/Add button missing from DOM");
    return;
  }

  // Repurpose as "Add Portal"
  btn.textContent = "Add Portal";

  btn.addEventListener("click", () => {
    try {
      addPortalFromTopInputs();
    } catch (err) {
      console.error("Add portal failed:", err);
    }
  });

  const topX = document.getElementById("top-x");
  const topY = document.getElementById("top-y");
  const topZ = document.getElementById("top-z");
  const topDest = document.getElementById("top-destination");
  const topName = document.getElementById("top-name");

  [topX, topY, topZ, topDest, topName].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", updateOutputCard);
  });
}

function addPortalFromTopInputs() {
  const nameEl = document.getElementById("top-name");
  const destEl = document.getElementById("top-destination");
  const xEl = document.getElementById("top-x");
  const yEl = document.getElementById("top-y");
  const zEl = document.getElementById("top-z");

  const name = nameEl.value.trim();
  const destination = destEl.value.trim();
  const xVal = xEl.value;
  const yVal = yEl.value;
  const zVal = zEl.value;

  const x = xVal === "" ? null : Number(xVal);
  const y = yVal === "" ? null : Number(yVal);
  const z = zVal === "" ? null : Number(zVal);

  const newPortal = {
    name,
    destination,
    x,
    y,
    z,
    world: topWorld,
    travel: { x: null, y: null, z: null, world: null },
    closest: { name: null, distance: null },
    target: { name: null, distance: null },
  };

  portals.push(newPortal);
  savePortalsToStorage();
  renderPortalList();

  nameEl.value = "";
  destEl.value = "";
  xEl.value = "";
  yEl.value = "";
  zEl.value = "";

  updateOutputCard();
}

// ---- Optional Reset Button ----

function resetPortals() {
  if (!confirm("Are you sure you want to reset all portals?")) return;

  portals = [createBlankPortal()];
  savePortalsToStorage();
  renderPortalList();
  updateOutputCard();
}


function exportPortalsToFile() {
  const data = JSON.stringify(portals, null, 2); // pretty JSON
  const blob = new Blob([data], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "portals.txt";
  a.click();

  URL.revokeObjectURL(url);
}

function importPortalsFromFile(file) {
  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);

      if (!Array.isArray(imported)) {
        alert("Invalid portal file format.");
        return;
      }

      portals = imported;
      savePortalsToStorage();
      renderPortalList();
      updateOutputCard();
    } catch (err) {
      alert("Failed to import portal data.");
      console.error(err);
    }
  };

  reader.readAsText(file);
}

// ---- App Bootstrap ----

document.addEventListener("DOMContentLoaded", () => {
  try {
    initializePortals();
    renderPortalList();
    setupTopWorldButtons();
    setupConvertButton();
    updateOutputCard();

    // Import / Export
    document.getElementById("exportBtn").addEventListener("click", exportPortalsToFile);
    document.getElementById("importFile").addEventListener("change", (e) => {
      if (e.target.files.length > 0) importPortalsFromFile(e.target.files[0]);
    });

    // Reset
    document.getElementById("resetBtn").addEventListener("click", resetPortals);

  } catch (err) {
    console.error("Fatal initialization error:", err);
  }
});


