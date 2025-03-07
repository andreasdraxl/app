// Import necessary libraries
import * as THREE from "three"; // Three.js for 3D graphics
import * as OBC from "@thatopen/components"; // Open BIM Components library
import * as OBF from "@thatopen/components-front"; // Frontend components for Open BIM
import * as BUI from "@thatopen/ui"; // UI components for Open BIM

// Import custom panels and toolbars
import projectInformation from "./components/Panels/ProjectInformation";
import elementData from "./components/Panels/Selection";
import settings from "./components/Panels/Settings";
import load from "./components/Toolbars/Sections/Import";
import help from "./components/Panels/Help";
import camera from "./components/Toolbars/Sections/Camera";
import measurement from "./components/Toolbars/Sections/Measurement";
import selection from "./components/Toolbars/Sections/Selection";
import { AppManager } from "./bim-components";

// Initialize the UI manager
BUI.Manager.init();

// Create the main component manager
const components = new OBC.Components();

// Create the main world for the 3D scene
const worlds = components.get(OBC.Worlds);
const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>();
world.name = "Main";

// Setup the scene
world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null; // No background color

// Create the viewport (3D viewer)
const viewport = BUI.Component.create<BUI.Viewport>(() => {
  return BUI.html`
    <bim-viewport>
      <bim-grid floating></bim-grid>
    </bim-viewport>
  `;
});

// Set up the renderer for the world
world.renderer = new OBF.PostproductionRenderer(components, viewport);
const { postproduction } = world.renderer;

// Create and configure the camera
world.camera = new OBC.OrthoPerspectiveCamera(components);

// Add a grid to the scene
const worldGrid = components.get(OBC.Grids).create(world);
worldGrid.material.uniforms.uColor.value = new THREE.Color(0x424242); // Dark gray grid
worldGrid.material.uniforms.uSize1.value = 2; // Small grid spacing
worldGrid.material.uniforms.uSize2.value = 8; // Large grid spacing

// Resize handler for the viewport
const resizeWorld = () => {
  world.renderer?.resize();
  world.camera.updateAspect();
};

// Listen for viewport resize events
viewport.addEventListener("resize", resizeWorld);

// Initialize all components
components.init();

// Enable post-processing effects
postproduction.enabled = true;
postproduction.customEffects.excludedMeshes.push(worldGrid.three);
postproduction.setPasses({ custom: true, ao: true, gamma: true });
postproduction.customEffects.lineColor = 0x17191c; // Dark gray lines

// Get the application manager
const appManager = components.get(AppManager);
const viewportGrid = viewport.querySelector<BUI.Grid>("bim-grid[floating]")!;
appManager.grids.set("viewport", viewportGrid);

// IFC (Industry Foundation Classes) related components
const fragments = components.get(OBC.FragmentsManager);
const indexer = components.get(OBC.IfcRelationsIndexer);
const classifier = components.get(OBC.Classifier);
classifier.list.CustomSelections = {};

// IFC model loader setup
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup();

// Streaming loader for large IFC models
const tilesLoader = components.get(OBF.IfcStreamer);
tilesLoader.world = world;
tilesLoader.culler.threshold = 10; // Culling threshold
tilesLoader.culler.maxHiddenTime = 1000;
tilesLoader.culler.maxLostTime = 40000;

// Highlighting selected IFC elements
const highlighter = components.get(OBF.Highlighter);
highlighter.setup({ world });
highlighter.zoomToSelection = true;

// Cull (hide) objects outside the viewport
const culler = components.get(OBC.Cullers).create(world);
culler.threshold = 5;

// Camera behavior settings
world.camera.controls.restThreshold = 0.25;
world.camera.controls.addEventListener("rest", () => {
  culler.needsUpdate = true;
  tilesLoader.cancel = true;
  tilesLoader.culler.needsUpdate = true;
});

// Handle loaded IFC fragments
fragments.onFragmentsLoaded.add(async (model) => {
  if (model.hasProperties) {
    await indexer.process(model); // Index IFC properties
    classifier.byEntity(model); // Classify elements
  }

  if (!model.isStreamed) {
    for (const fragment of model.items) {
      world.meshes.add(fragment.mesh);
      culler.add(fragment.mesh);
    }
  }

  world.scene.three.add(model);

  if (!model.isStreamed) {
    setTimeout(async () => {
      world.camera.fit(world.meshes, 0.8); // Adjust camera to fit model
    }, 50);
  }
});

// Handle removed IFC fragments
fragments.onFragmentsDisposed.add(({ fragmentIDs }) => {
  for (const fragmentID of fragmentIDs) {
    const mesh = [...world.meshes].find((mesh) => mesh.uuid === fragmentID);
    if (mesh) {
      world.meshes.delete(mesh);
    }
  }
});

// Create UI panels
const projectInformationPanel = projectInformation(components);
const elementDataPanel = elementData(components);

// Create the top toolbar
const toolbar = BUI.Component.create(() => {
  return BUI.html`
    <bim-tabs floating style="justify-self: center; border-radius: 0.5rem;">
      <bim-tab label="Import">
        <bim-toolbar>
          ${load(components)}
        </bim-toolbar>
      </bim-tab>
      <bim-tab label="Selection">
        <bim-toolbar>
          ${camera(world)}
          ${selection(components, world)}
        </bim-toolbar>
      </bim-tab>
      <bim-tab label="Measurement">
        <bim-toolbar>
            ${measurement(world, components)}
        </bim-toolbar>      
      </bim-tab>
    </bim-tabs>
  `;
});

// Create the left-side panel with project information, settings, and help
const leftPanel = BUI.Component.create(() => {
  return BUI.html`
    <bim-tabs switchers-full>
      n
        ${projectInformationPanel}
      </bim-tab>
      <bim-tab name="settings" label="Settings" icon="solar:settings-bold">
        ${settings(components)}
      </bim-tab>
      <bim-tab name="help" label="Help" icon="material-symbols:help">
        ${help}
      </bim-tab>
    </bim-tabs> 
  `;
});

// Set up the main layout
const app = document.getElementById("app") as BUI.Grid;
app.layouts = {
  main: {
    template: `
      "leftPanel viewport" 1fr
      /26rem 1fr
    `,
    elements: {
      leftPanel,
      viewport,
    },
  },
};
app.layout = "main";

// Configure the viewport layout
viewportGrid.layouts = {
  main: {
    template: `
      "empty" 1fr
      "toolbar" auto
      /1fr
    `,
    elements: { toolbar },
  },
  second: {
    template: `
      "empty elementDataPanel" 1fr
      "toolbar elementDataPanel" auto
      /1fr 24rem
    `,
    elements: {
      toolbar,
      elementDataPanel,
    },
  },
};
viewportGrid.layout = "main";
