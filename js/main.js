import * as CANNON from 'https://cdn.skypack.dev/cannon-es';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import * as dat from 'dat.gui';
import * as TWEEN from 'https://cdn.skypack.dev/@tweenjs/tween.js';


const gui = new dat.GUI();

const canvasEl = document.querySelector('#canvas');
const scoreResult = document.querySelector('#score-result');
const rollBtn = document.querySelector('#roll-btn');

let isRealignmentInProgress = false;
let isRealignmentInProgress2 = false;
let canSelect = true;

let renderer, scene, camera, diceMesh, physicsWorld;
const diceDebugFolder = gui.addFolder('Dice Debug');
const params = {
    numberOfDice: 5,
    segments: 40,
    edgeRadius: .07,
    notchRadius: .12,
    notchDepth: .1,
    rectangle: {
        width: 10,
        height: 2,
        positionX: 2,
        positionY: -6,
        positionZ: -5,
    },
};
let scoreGlobal = []
let diceArray = [];
let diceArraySelected = [];

initPhysics();
initScene();

window.addEventListener('resize', updateSceneSize);
// window.addEventListener('dblclick', throwDice);
rollBtn.addEventListener('click', throwDice);
var rectangleMesh;

/*
Création de la scène
*/
function initScene() {

    renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas: canvasEl
    });
    renderer.shadowMap.enabled = true
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, .1, 300)
    camera.position.set(0, 7, 10);
    camera.rotation.set(18, 0, 0);

    initDatGui();

    updateSceneSize();

    const ambientLight = new THREE.AmbientLight(0xffffff, .5);
    scene.add(ambientLight);
    const topLight = new THREE.PointLight(0xffffff, .5);
    topLight.position.set(10, 15, 0);
    topLight.castShadow = true;
    topLight.shadow.mapSize.width = 2048;
    topLight.shadow.mapSize.height = 2048;
    topLight.shadow.camera.near = 5;
    topLight.shadow.camera.far = 400;
    scene.add(topLight);

    createFloor();
    diceMesh = createDiceMesh();
    for (let i = 0; i < params.numberOfDice; i++) {
        diceArray.push(createDice());
        addDiceEvents(diceArray[i]);
    }


    createOrUpdateRectangle();

    throwDice();

    window.addEventListener('click', onDocumentMouseDown, false);

    render();
}


/*
Evenement click sur la scene
*/
function onDocumentMouseDown(event) {
    var raycaster = new THREE.Raycaster();
    var mouse = new THREE.Vector2();
    event.preventDefault();
    mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = - (event.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    // console.log(scene.children);
    var intersects = raycaster.intersectObjects(scene.children);
    // console.log(intersects);
    if (intersects.length > 0) {
        const selectedObject = intersects[0].object.parent;
        // console.log(selectedObject)
        if (selectedObject.type === "Group") {
            selectedObject.callback()
            // Vérification si l'objet parent a des enfants
            if (selectedObject.children.length > 0) {
                // Parcourir tous les enfants de l'objet parent
                selectedObject.children.forEach(child => {
                    selectedObject.rotation.set(0, 0, 0);
                    if (child.scale.x === 1.2) {
                        child.scale.set(1, 1, 1); // Changer l'échelle de l'enfant à 1
                    } else {
                        // console.log(selectedObject)

                        child.scale.set(1.2, 1.2, 1.2); // Changer l'échelle de l'enfant à 1.2
                    }
                });
            }
        }
    }
}


/*
Création de rectangle pour collision
*/
function createOrUpdateRectangle() {

    const rectangleShape = new CANNON.Box(new CANNON.Vec3(params.rectangle.width * 0.5, params.rectangle.height * 0.5, 0.05));

    if (!rectangleMesh) {
        const geometry = new THREE.BoxGeometry(params.rectangle.width, params.rectangle.height, 0.1);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000
        });

        rectangleMesh = new THREE.Mesh(geometry, material);
        var rectangleMesh2 = new THREE.Mesh(geometry, material);
        var rectangleMesh3 = new THREE.Mesh(geometry, material);
        rectangleMesh.receiveShadow = true;
        rectangleMesh.position.set(params.rectangle.positionX, params.rectangle.positionY, params.rectangle.positionZ);
        rectangleMesh2.position.set(params.rectangle.positionX, params.rectangle.positionY, -params.rectangle.positionZ);
        scene.add(rectangleMesh);
        scene.add(rectangleMesh2);
        //colision cannon
        // const body = new CANNON.Body({
        //     mass: 1,
        //     shape: new CANNON.Box(new CANNON.Vec3(params.rectangle.width, params.rectangle.height, 0.1)),
        //     sleepTimeLimit: .1
        // });
        // physicsWorld.addBody(body);

        const rectangleBody = new CANNON.Body({
            mass: 0, // Masse nulle pour un objet statique (mur, sol, etc.)
            shape: rectangleShape,
            position: new CANNON.Vec3(params.rectangle.positionX, params.rectangle.positionY, params.rectangle.positionZ),
            quaternion: new CANNON.Quaternion()
        });
        physicsWorld.addBody(rectangleBody);
    } else {
        rectangleMesh.scale.set(params.rectangle.width, params.rectangle.height, 0.1);
        rectangleMesh.position.set(params.rectangle.positionX, params.rectangle.positionY, params.rectangle.positionZ);
    }
}

function updateRectangle() {
    rectangleMesh.scale.set(params.rectangle.width, params.rectangle.height, 0.1);
    rectangleMesh.position.set(params.rectangle.positionX, params.rectangle.positionY, params.rectangle.positionZ);
}


/*
Initialisation de la physique
*/
function initPhysics() {
    physicsWorld = new CANNON.World({
        allowSleep: true,
        gravity: new CANNON.Vec3(0, -50, 0),
    })
    physicsWorld.defaultContactMaterial.restitution = .3;
}


/*
Création du plane
*/
function createFloor() {
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 1000),
        new THREE.ShadowMaterial({
            opacity: .1
        })
    )
    floor.receiveShadow = true;
    floor.position.y = -7;
    floor.quaternion.setFromAxisAngle(new THREE.Vector3(-1, 0, 0), Math.PI * .5);
    scene.add(floor);

    const floorBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
    });
    floorBody.position.copy(floor.position);
    floorBody.quaternion.copy(floor.quaternion);
    physicsWorld.addBody(floorBody);
}

/*
Maillage du dés en regroupement Plane et Box geometry
*/
function createDiceMesh() {
    const boxMaterialOuter = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
    })
    const boxMaterialInner = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0,
        metalness: 1,
        side: THREE.DoubleSide
    })

    const diceMesh = new THREE.Group();
    const innerMesh = new THREE.Mesh(createInnerGeometry(), boxMaterialInner);
    let outerMesh = new THREE.Mesh(createBoxGeometry(), boxMaterialOuter);

    outerMesh.castShadow = true;
    diceMesh.add(innerMesh, outerMesh);



    return diceMesh;
}

/*
Création des dés
*/
function createDice() {
    const mesh = diceMesh.clone();
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(.5, .5, .5)),
        sleepTimeLimit: .1,
    });
    // body.initQuaternion = mesh.quaternion.clone();
    physicsWorld.addBody(body);

    return { mesh, body };
}

/*
Box geometry à l'exterieur des dés
*/
function createBoxGeometry() {

    let boxGeometry = new THREE.BoxGeometry(1, 1, 1, params.segments, params.segments, params.segments);
    // boxGeometry.callback = function() { console.log("dsfdsfds"); }
    const positionAttr = boxGeometry.attributes.position;
    const subCubeHalfSize = .5 - params.edgeRadius;


    for (let i = 0; i < positionAttr.count; i++) {

        let position = new THREE.Vector3().fromBufferAttribute(positionAttr, i);

        const subCube = new THREE.Vector3(Math.sign(position.x), Math.sign(position.y), Math.sign(position.z)).multiplyScalar(subCubeHalfSize);
        const addition = new THREE.Vector3().subVectors(position, subCube);

        if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.normalize().multiplyScalar(params.edgeRadius);
            position = subCube.add(addition);
        } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize) {
            addition.z = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.x = subCube.x + addition.x;
            position.y = subCube.y + addition.y;
        } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.y = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.x = subCube.x + addition.x;
            position.z = subCube.z + addition.z;
        } else if (Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.x = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.y = subCube.y + addition.y;
            position.z = subCube.z + addition.z;
        }

        const notchWave = (v) => {
            v = (1 / params.notchRadius) * v;
            v = Math.PI * Math.max(-1, Math.min(1, v));
            return params.notchDepth * (Math.cos(v) + 1.);
        }
        const notch = (pos) => notchWave(pos[0]) * notchWave(pos[1]);

        const offset = .23;

        if (position.y === .5) {
            position.y -= notch([position.x, position.z]);
        } else if (position.x === .5) {
            position.x -= notch([position.y + offset, position.z + offset]);
            position.x -= notch([position.y - offset, position.z - offset]);
        } else if (position.z === .5) {
            position.z -= notch([position.x - offset, position.y + offset]);
            position.z -= notch([position.x, position.y]);
            position.z -= notch([position.x + offset, position.y - offset]);
        } else if (position.z === -.5) {
            position.z += notch([position.x + offset, position.y + offset]);
            position.z += notch([position.x + offset, position.y - offset]);
            position.z += notch([position.x - offset, position.y + offset]);
            position.z += notch([position.x - offset, position.y - offset]);
        } else if (position.x === -.5) {
            position.x += notch([position.y + offset, position.z + offset]);
            position.x += notch([position.y + offset, position.z - offset]);
            position.x += notch([position.y, position.z]);
            position.x += notch([position.y - offset, position.z + offset]);
            position.x += notch([position.y - offset, position.z - offset]);
        } else if (position.y === -.5) {
            position.y += notch([position.x + offset, position.z + offset]);
            position.y += notch([position.x + offset, position.z]);
            position.y += notch([position.x + offset, position.z - offset]);
            position.y += notch([position.x - offset, position.z + offset]);
            position.y += notch([position.x - offset, position.z]);
            position.y += notch([position.x - offset, position.z - offset]);
        }

        positionAttr.setXYZ(i, position.x, position.y, position.z);
    }


    boxGeometry.deleteAttribute('normal');
    boxGeometry.deleteAttribute('uv');
    boxGeometry = BufferGeometryUtils.mergeVertices(boxGeometry);

    boxGeometry.computeVertexNormals();

    return boxGeometry;
}

/*
Plane geometry à l'intérieur des dés
*/
function createInnerGeometry() {
    const baseGeometry = new THREE.PlaneGeometry(1 - 2 * params.edgeRadius, 1 - 2 * params.edgeRadius);
    const offset = .48;
    return BufferGeometryUtils.mergeBufferGeometries([
        baseGeometry.clone().translate(0, 0, offset),
        baseGeometry.clone().translate(0, 0, -offset),
        baseGeometry.clone().rotateX(.5 * Math.PI).translate(0, -offset, 0),
        baseGeometry.clone().rotateX(.5 * Math.PI).translate(0, offset, 0),
        baseGeometry.clone().rotateY(.5 * Math.PI).translate(-offset, 0, 0),
        baseGeometry.clone().rotateY(.5 * Math.PI).translate(offset, 0, 0),
    ], false);
}

/*
Résultats en texte
*/
function addDiceEvents(dice) {
    dice.body.addEventListener('sleep', (e) => {

        dice.body.allowSleep = false;

        const euler = new CANNON.Vec3();
        e.target.quaternion.toEuler(euler);

        const eps = .1;
        let isZero = (angle) => Math.abs(angle) < eps;
        let isHalfPi = (angle) => Math.abs(angle - .5 * Math.PI) < eps;
        let isMinusHalfPi = (angle) => Math.abs(.5 * Math.PI + angle) < eps;
        let isPiOrMinusPi = (angle) => (Math.abs(Math.PI - angle) < eps || Math.abs(Math.PI + angle) < eps);


        if (isZero(euler.z)) {

            if (isZero(euler.x)) {
                showRollResults(1);
                dice.mesh.callback = function () {
                    console.log(1);
                    selectedDice(dice);
                }

            } else if (isHalfPi(euler.x)) {
                showRollResults(4);
                dice.mesh.callback = function () { console.log(4); selectedDice(dice); }
            } else if (isMinusHalfPi(euler.x)) {
                showRollResults(3);
                dice.mesh.callback = function () { console.log(3); selectedDice(dice); }
            } else if (isPiOrMinusPi(euler.x)) {
                showRollResults(6);
                dice.mesh.callback = function () { console.log(6); selectedDice(dice); }
            } else {
                // landed on edge => wait to fall on side and fire the event again
                dice.body.allowSleep = true;
            }
        } else if (isHalfPi(euler.z)) {
            showRollResults(2);
            dice.mesh.callback = function () { console.log(2); selectedDice(dice); }
        } else if (isMinusHalfPi(euler.z)) {
            showRollResults(5);
            dice.mesh.callback = function () { console.log(5); selectedDice(dice); }
        } else {
            // landed on edge => wait to fall on side and fire the event again
            dice.body.allowSleep = true;
        }
    });

}


// ...

// Modifiez la fonction selectedDice
function selectedDice(dice) {
    if (scoreGlobal.length == diceArray.length) {
        console.log(dice);

        if (!canSelect) {
            return;
        }

        const targetPosition = new CANNON.Vec3(diceArraySelected.length * 2, 0, -5);

        new TWEEN.Tween(dice.mesh.position)
            .to({
                x: targetPosition.x,
                y: targetPosition.y,
                z: targetPosition.z
            }, 500)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onStart(() => {
                const selectedDiceIndex = diceArray.indexOf(dice);
                diceArray.splice(selectedDiceIndex, 1);
                diceArraySelected.push(dice);
                console.log("______Dés_______");
                console.log(diceArray);
                console.log("______Dés Sélectionnés_______");
                console.log(diceArraySelected);
            })
            .onUpdate(() => {
                dice.body.position.copy(dice.mesh.position);
            })
            .onComplete(() => {
                if (!isRealignmentInProgress) {
                    isRealignmentInProgress = true;
                    realignDice(() => {
                        isRealignmentInProgress = false;
                    });
                }
            })
            .start();

        canSelect = false;
        setTimeout(() => {
            canSelect = true;
        }, 1000);

        dice.mesh.callback = function () { unselectedDice(dice); }
    }
}

function unselectedDice(dice) {
    if (scoreGlobal.length == diceArray.length) {

        if (!canSelect) {
            return;
        }

        const targetPosition = new CANNON.Vec3((diceArray.length) * 2, 0, 0);

        new TWEEN.Tween(dice.mesh.position)
            .to({
                x: targetPosition.x,
                y: targetPosition.y,
                z: targetPosition.z
            }, 500)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onStart(() => {
                const selectedDiceIndex = diceArraySelected.indexOf(dice);
                diceArraySelected.splice(selectedDiceIndex, 1);
                diceArray.push(dice);
                console.log("______Dés_______");
                console.log(diceArray);
                console.log("______Dés Sélectionnés_______");
                console.log(diceArraySelected);
            })
            .onUpdate(() => {
                dice.body.position.copy(dice.mesh.position);
            })
            .onComplete(() => {
                if (!isRealignmentInProgress2) {
                    isRealignmentInProgress2 = true;
                    realignDiceSelected(() => {
                        isRealignmentInProgress2 = false;
                    });
                }
            })
            .start();

        canSelect = false;
        setTimeout(() => {
            canSelect = true;
        }, 1000);

        dice.mesh.callback = function () { selectedDice(dice); };
    }
}

function realignDiceSelected(callback) {
    const alignmentDuration = 0.3;
    const delayBetweenDice = 0.1;
    let completedCount = 0;

    diceArraySelected.forEach((dice, index) => {
        console.log(diceArraySelected)
        const targetPosition = new CANNON.Vec3(index * 2, 0, -5);
        new TWEEN.Tween(dice.body.position)
            .to({
                x: targetPosition.x,
                y: targetPosition.y,
                z: targetPosition.z
            }, alignmentDuration * 1000)
            .easing(TWEEN.Easing.Quadratic.Out)
            .delay(index * delayBetweenDice * 1000)
            .onComplete(() => {
                completedCount++;
                if (completedCount === diceArraySelected.length) {
                    callback();
                }
            })
            .start();

        new TWEEN.Tween({ y: dice.mesh.rotation.y })
            .to({ y: 0 }, alignmentDuration * 1000)
            .easing(TWEEN.Easing.Quadratic.Out)
            .delay(index * delayBetweenDice * 1000)
            .onUpdate((obj) => {
                dice.mesh.rotation.y = obj.y;
                dice.mesh.rotation.reorder('YXZ');
                dice.body.quaternion.copy(dice.mesh.quaternion);
            })
            .start();
    });
}

function realignDice(callback) {
    const alignmentDuration = 0.3;
    const delayBetweenDice = 0.1;
    let completedCount = 0;
    console.log(isRealignmentInProgress)
    diceArray.forEach((dice, index) => {
        const targetPosition = new CANNON.Vec3(index * 2, 0, 0);
        new TWEEN.Tween(dice.body.position)
            .to({
                x: targetPosition.x,
                y: targetPosition.y,
                z: targetPosition.z
            }, alignmentDuration * 1000)
            .easing(TWEEN.Easing.Quadratic.Out)
            .delay(index * delayBetweenDice * 1000)
            .onComplete(() => {
                completedCount++;
                if (completedCount === diceArray.length) {
                    callback();
                }
            })
            .start();

        new TWEEN.Tween({ y: dice.mesh.rotation.y })
            .to({ y: 0 }, alignmentDuration * 1000)
            .easing(TWEEN.Easing.Quadratic.Out)
            .delay(index * delayBetweenDice * 1000)
            .onUpdate((obj) => {
                dice.mesh.rotation.y = obj.y;
                dice.mesh.rotation.reorder('YXZ');
                dice.body.quaternion.copy(dice.mesh.quaternion);
            })
            .start();
    });
}


/*
Résultats score en texte
*/
function showRollResults(score) {
    scoreGlobal.push(score)

    if (scoreGlobal.length == diceArray.length) {
        alignDiceInLine();
    }
    if (scoreResult.innerHTML === '') {
        scoreResult.innerHTML += score;
    } else {

        scoreResult.innerHTML += ('+' + score);
    }
}

/*
Rendu de la scene
*/
function render() {
    physicsWorld.fixedStep();

    for (const dice of diceArray) {
        dice.mesh.position.copy(dice.body.position)
        dice.mesh.quaternion.copy(dice.body.quaternion)
    }
    for (const dice of diceArraySelected) {
        dice.mesh.position.copy(dice.body.position)
        dice.mesh.quaternion.copy(dice.body.quaternion)
    }

    TWEEN.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
}

/*
Responsive scene
*/
function updateSceneSize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


/*
Lancer dés 
*/
function throwDice() {
    scoreResult.innerHTML = '';
    scoreGlobal = [];

    isRealignmentInProgress = false;
    isRealignmentInProgress2 = false;

    diceArray.forEach((d, dIdx) => {

        d.body.velocity.setZero();
        d.body.angularVelocity.setZero();

        d.body.position = new CANNON.Vec3(6, dIdx * 1.5, 0);
        d.mesh.position.copy(d.body.position);

        d.mesh.rotation.set(2 * Math.PI * Math.random(), 0, 2 * Math.PI * Math.random())
        d.body.quaternion.copy(d.mesh.quaternion);

        const force = 3 + 5 * Math.random();
        d.body.applyImpulse(
            new CANNON.Vec3(-force, force, 0),
            new CANNON.Vec3(0, 0, .2)
        );
        // d.mesh.callback = function() { console.log("test"); }
        d.body.allowSleep = true;


    });

}

/*
Alignement des dés après le lancer
*/
function alignDiceInLine() {
    const alignmentDuration = 1;
    const delayBetweenDice = 0.2;
    // Utilisation de Tween pour animer la position et la rotation des dés
    diceArray.forEach((dice, index) => {
        const targetPosition = new CANNON.Vec3(0 + index * 2, 0, 0); // Position cible en ligne

        new TWEEN.Tween(dice.body.position)
            .to({
                x: targetPosition.x,
                y: targetPosition.y,
                z: targetPosition.z
            }, alignmentDuration * 1000)
            .easing(TWEEN.Easing.Quadratic.Out)
            .delay(index * delayBetweenDice * 1000)
            .start();


        new TWEEN.Tween({ y: dice.mesh.rotation.y })
            .to({ y: 0 }, alignmentDuration * 1000)
            .easing(TWEEN.Easing.Quadratic.Out)
            .delay(index * delayBetweenDice * 1000)
            .onUpdate((obj) => {
                dice.mesh.rotation.y = obj.y;
                dice.mesh.rotation.reorder('YXZ');
                dice.body.quaternion.copy(dice.mesh.quaternion);
            })
            .start();

    });

}


/*
Alignement des dés après le lancer
*/
function initDatGui() {

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.y = 0.5

    const perspectiveCameraFolder = gui.addFolder('Camera');
    perspectiveCameraFolder.add(camera.position, 'x', -20, 20, 0.1);
    perspectiveCameraFolder.add(camera.position, 'y', -20, 20, 0.1);
    perspectiveCameraFolder.add(camera.position, 'z', -20, 20, 0.1);
    perspectiveCameraFolder.add(camera.rotation, 'x', -20, 20, 0.1);
    perspectiveCameraFolder.add(camera.rotation, 'y', -20, 20, 0.1);
    perspectiveCameraFolder.add(camera.rotation, 'z', -20, 20, 0.1);
    perspectiveCameraFolder.open()


    const rectangleFolder = gui.addFolder('Rectangle');
    rectangleFolder.add(params.rectangle, 'width', 1, 5).onChange(updateRectangle);
    rectangleFolder.add(params.rectangle, 'height', 1, 5).onChange(updateRectangle);
    rectangleFolder.add(params.rectangle, 'positionX', -10, 10).onChange(updateRectangle);
    rectangleFolder.add(params.rectangle, 'positionY', -10, 10).onChange(updateRectangle);
    rectangleFolder.add(params.rectangle, 'positionZ', -10, 10).onChange(updateRectangle);



    diceArray.forEach((dice, index) => {
        const diceFolder = diceDebugFolder.addFolder(`Dice ${index + 1}`);
        diceFolder.add(dice.body.position, 'x').listen().name('Position X');
        diceFolder.add(dice.body.position, 'y').listen().name('Position Y');
        diceFolder.add(dice.body.position, 'z').listen().name('Position Z');
        diceFolder.add(dice.mesh.rotation, 'x').listen().name('rotation X');
        diceFolder.add(dice.mesh.rotation, 'y').listen().name('rotation Y');
        diceFolder.add(dice.mesh.rotation, 'z').listen().name('rotation Z');
        diceFolder.add(dice.body.quaternion, 'x').listen().name('Quaternion X');
        diceFolder.add(dice.body.quaternion, 'y').listen().name('Quaternion Y');
        diceFolder.add(dice.body.quaternion, 'z').listen().name('Quaternion Z');
        diceFolder.add(dice.body.quaternion, 'w').listen().name('Quaternion W');
    });
}

