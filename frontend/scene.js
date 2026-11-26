// Cena 3D do campo: 4 talhões, canal de irrigação e 12 sensores que mudam de cor conforme a situação.
// Usa a build global do three.js (r128) carregada pelo index.html.
(function () {
  const CORES_STATUS = { ok: 0x5fe39a, atencao: 0xffc94d, critico: 0xff5a4e, offline: 0x9fb3a8, sem: 0x9fb3a8 };
  const TEMAS = {
    dia: {
      fundo: 0x0f4d32, grama: 0x2c6b38, solo: 0x6b4a33, agua: 0x3b8fd6,
      hemi: [0xe4f4ff, 0x2b4a2f, 0.95], sol: [0xfff3dc, 1.05], estrelas: 0
    },
    noite: {
      fundo: 0x06170f, grama: 0x173d24, solo: 0x2e2118, agua: 0x2a6fb0,
      hemi: [0x34558a, 0x050f0a, 0.45], sol: [0xa9c8ff, 0.55], estrelas: 1
    }
  };
  // Posições dos talhões (grade 2x2 cortada por um canal em cruz) e dos sensores dentro de cada um
  const CENTROS = [[-5.6, -5.6], [5.6, -5.6], [-5.6, 5.6], [5.6, 5.6]];
  const POS_SENSORES = [[-2.6, -2.4], [2.3, 0.4], [-0.6, 2.9]];
  const TAM = 9.4;

  function iniciar(canvas, rotulosEl, plantacoes, aoClicar) {
    if (!window.THREE) throw new Error("three.js não carregou");
    const T = window.THREE;
    const reduzMov = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;

    const cena = new T.Scene();
    cena.fog = new T.Fog(TEMAS.dia.fundo, 30, 58);
    const camera = new T.PerspectiveCamera(34, 1, 0.1, 200);

    const hemi = new T.HemisphereLight(...TEMAS.dia.hemi);
    cena.add(hemi);
    const sol = new T.DirectionalLight(...TEMAS.dia.sol);
    sol.position.set(14, 22, 9);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    Object.assign(sol.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    cena.add(sol);

    // Chão e canal
    const matGrama = new T.MeshStandardMaterial({ color: TEMAS.dia.grama, roughness: 1 });
    const chao = new T.Mesh(new T.CircleGeometry(140, 48), matGrama);
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    cena.add(chao);

    const matAgua = new T.MeshStandardMaterial({ color: TEMAS.dia.agua, roughness: 0.25, metalness: 0.1, emissive: 0x0a2a4a, emissiveIntensity: 0.4 });
    [[26, 1.3], [1.3, 26]].forEach(([w, d]) => {
      const canal = new T.Mesh(new T.BoxGeometry(w, 0.08, d), matAgua);
      canal.position.y = 0.04;
      cena.add(canal);
    });

    const matSolo = new T.MeshStandardMaterial({ color: TEMAS.dia.solo, roughness: 1 });
    const alvos = [];
    const sensores = {};
    const aneis = [];

    function instanciar(geo, cor, posicoes, ajuste) {
      const mat = new T.MeshStandardMaterial({ color: cor, roughness: 0.85, flatShading: true });
      const mesh = new T.InstancedMesh(geo, mat, posicoes.length);
      const m = new T.Object3D();
      posicoes.forEach(([x, z], i) => {
        m.position.set(x, 0, z);
        m.rotation.set(0, Math.random() * Math.PI, 0);
        m.scale.set(1, 1, 1);
        ajuste(m, i);
        m.updateMatrix();
        mesh.setMatrixAt(i, m.matrix);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
    function grade(cx, cz, passoX, passoZ) {
      const pts = [];
      const meio = TAM / 2 - 0.6;
      for (let x = -meio; x <= meio + 0.01; x += passoX)
        for (let z = -meio; z <= meio + 0.01; z += passoZ)
          pts.push([cx + x + (Math.random() - 0.5) * 0.12, cz + z + (Math.random() - 0.5) * 0.12]);
      return pts;
    }
    const jit = (a, b) => a + Math.random() * (b - a);

    // Cada cultura tem um formato próprio para ser reconhecível de longe
    const culturas = {
      cafe: (cx, cz) => instanciar(new T.IcosahedronGeometry(0.42, 1), 0x1f6a37, grade(cx, cz, 1.15, 0.85),
        (m) => { const s = jit(0.85, 1.1); m.scale.set(s, s * 1.15, s); m.position.y = 0.2 + 0.45 * s; }),
      milho: (cx, cz) => instanciar(new T.ConeGeometry(0.2, 1.7, 5), 0x9cc04f, grade(cx, cz, 0.72, 0.72),
        (m) => { const s = jit(0.85, 1.15); m.scale.set(1, s, 1); m.position.y = 0.15 + 0.85 * s; }),
      soja: (cx, cz) => instanciar(new T.SphereGeometry(0.32, 6, 4), 0x46ad55, grade(cx, cz, 0.75, 0.7),
        (m) => { const s = jit(0.8, 1.1); m.scale.set(s, s * 0.6, s); m.position.y = 0.15 + 0.18 * s; }),
      cana: (cx, cz) => instanciar(new T.BoxGeometry(0.09, 2.4, 0.09), 0x6aa344, grade(cx, cz, 0.48, 0.62),
        (m) => { const s = jit(0.85, 1.15); m.scale.set(1, s, 1); m.position.y = 0.15 + 1.2 * s; m.rotation.z = jit(-0.12, 0.12); m.rotation.x = jit(-0.12, 0.12); })
    };

    const geoPoste = new T.CylinderGeometry(0.05, 0.05, 2.9, 6);
    const geoCabeca = new T.SphereGeometry(0.26, 16, 12);
    const geoAnel = new T.RingGeometry(0.34, 0.46, 40);
    const matPoste = new T.MeshStandardMaterial({ color: 0xf2f5f3, roughness: 0.6 });

    plantacoes.forEach((p, i) => {
      const [cx, cz] = CENTROS[i % 4];
      const solo = new T.Mesh(new T.BoxGeometry(TAM, 0.3, TAM), matSolo);
      solo.position.set(cx, 0.15, cz);
      solo.receiveShadow = true;
      cena.add(solo);
      const criar = culturas[p.id] || culturas.soja;
      cena.add(criar(cx, cz));

      const alvo = new T.Mesh(new T.BoxGeometry(TAM, 3, TAM), new T.MeshBasicMaterial({ visible: false }));
      alvo.position.set(cx, 1.5, cz);
      alvo.userData.id = p.id;
      cena.add(alvo);
      alvos.push(alvo);

      p.sensores.forEach((s, j) => {
        const [ox, oz] = POS_SENSORES[j % 3];
        const poste = new T.Mesh(geoPoste, matPoste);
        poste.position.set(cx + ox, 1.6, cz + oz);
        poste.castShadow = true;
        const mat = new T.MeshStandardMaterial({ color: CORES_STATUS.sem, emissive: CORES_STATUS.sem, emissiveIntensity: 0.5, roughness: 0.4 });
        const cabeca = new T.Mesh(geoCabeca, mat);
        cabeca.position.set(cx + ox, 3.1, cz + oz);
        const matAnel = new T.MeshBasicMaterial({ color: CORES_STATUS.critico, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false });
        const anel = new T.Mesh(geoAnel, matAnel);
        anel.rotation.x = -Math.PI / 2;
        anel.position.copy(cabeca.position);
        anel.userData.fase = Math.random();
        cena.add(poste, cabeca, anel);
        sensores[s.id] = { mat, anel, status: "sem" };
        aneis.push(anel);
      });
    });

    // Estrelas (só aparecem no modo noite)
    const geoEst = new T.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 500; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.45 * Math.PI, r = 70;
      pts.push(r * Math.cos(th) * Math.sin(ph), r * Math.cos(ph) * 0.6 + 8, r * Math.sin(th) * Math.sin(ph));
    }
    geoEst.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
    const matEst = new T.PointsMaterial({ color: 0xdfeaff, size: 0.35, transparent: true, opacity: 0, fog: false });
    cena.add(new T.Points(geoEst, matEst));

    // Rótulos HTML das lavouras
    rotulosEl.innerHTML = "";
    const rotulos = plantacoes.map((p) => {
      const el = document.createElement("span");
      el.textContent = p.nome;
      rotulosEl.appendChild(el);
      return el;
    });

    // Câmera orbital simples: gira devagar, arraste para girar
    let angulo = 0.75, arrastando = false, xIni = 0, angIni = 0, moveu = false;
    const v = new T.Vector3();
    function posicionarCamera() {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      const raio = w / h < 1.2 ? 38 : 31;
      camera.aspect = w / h;
      camera.position.set(Math.cos(angulo) * raio, raio * 0.72, Math.sin(angulo) * raio);
      camera.lookAt(0, 0.5, 0);
      camera.updateProjectionMatrix();
    }
    function atualizarRotulos() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      plantacoes.forEach((p, i) => {
        const [cx, cz] = CENTROS[i % 4];
        v.set(cx, 3.9, cz).project(camera);
        rotulos[i].style.left = ((v.x + 1) / 2) * w + "px";
        rotulos[i].style.top = ((1 - v.y) / 2) * h + "px";
      });
    }

    const ray = new T.Raycaster();
    const ptr = new T.Vector2();
    function plotSob(e) {
      const r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObjects(alvos)[0];
      return hit ? hit.object.userData.id : null;
    }
    canvas.addEventListener("pointerdown", (e) => { arrastando = true; moveu = false; xIni = e.clientX; angIni = angulo; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (arrastando) {
        const dx = e.clientX - xIni;
        if (Math.abs(dx) > 4) moveu = true;
        angulo = angIni - dx * 0.008;
        if (!rodando) renderizar();
      } else {
        canvas.style.cursor = plotSob(e) ? "pointer" : "grab";
      }
    });
    canvas.addEventListener("pointerup", (e) => {
      arrastando = false;
      if (!moveu) { const id = plotSob(e); if (id && aoClicar) aoClicar(id); }
    });

    let t0 = performance.now();
    function renderizar() {
      posicionarCamera();
      renderer.render(cena, camera);
      atualizarRotulos();
    }
    let rodando = false, visivel = true;
    function quadro(t) {
      if (!rodando) return;
      const dt = Math.min((t - t0) / 1000, 0.1);
      t0 = t;
      if (!reduzMov && !arrastando) angulo += dt * 0.06;
      aneis.forEach((a) => {
        if (!a.visible) return;
        a.userData.fase = (a.userData.fase + dt * 0.6) % 1;
        const f = a.userData.fase;
        a.scale.setScalar(1 + f * 2.6);
        a.material.opacity = (1 - f) * 0.85;
      });
      renderizar();
      requestAnimationFrame(quadro);
    }
    function ligar() {
      const deve = visivel && !document.hidden;
      if (deve && !rodando) { rodando = true; t0 = performance.now(); requestAnimationFrame(quadro); }
      if (!deve) rodando = false;
    }
    const io = new IntersectionObserver((ents) => { visivel = ents[0].isIntersecting; ligar(); });
    io.observe(canvas);
    document.addEventListener("visibilitychange", ligar);
    const ro = new ResizeObserver(() => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      renderizar();
    });
    ro.observe(canvas);

    return {
      setNoite(noite) {
        const t = noite ? TEMAS.noite : TEMAS.dia;
        cena.fog.color.setHex(t.fundo);
        matGrama.color.setHex(t.grama);
        matSolo.color.setHex(t.solo);
        matAgua.color.setHex(t.agua);
        hemi.color.setHex(t.hemi[0]); hemi.groundColor.setHex(t.hemi[1]); hemi.intensity = t.hemi[2];
        sol.color.setHex(t.sol[0]); sol.intensity = t.sol[1];
        sol.position.set(noite ? -12 : 14, noite ? 18 : 22, noite ? -6 : 9);
        matEst.opacity = t.estrelas;
        Object.values(sensores).forEach((s) => { s.mat.emissiveIntensity = noite ? 1.1 : 0.5; });
        renderizar();
      },
      setStatus(porSensor, porPlantacao) {
        Object.entries(sensores).forEach(([id, s]) => {
          const st = porSensor[id] || "sem";
          s.mat.color.setHex(CORES_STATUS[st]);
          s.mat.emissive.setHex(CORES_STATUS[st]);
          const alerta = st === "atencao" || st === "critico";
          s.anel.visible = alerta && !reduzMov;
          s.anel.material.color.setHex(CORES_STATUS[st]);
          if (!s.anel.visible) s.anel.material.opacity = 0;
        });
        plantacoes.forEach((p, i) => {
          const st = porPlantacao[p.id] || "ok";
          rotulos[i].className = st === "atencao" || st === "critico" ? st : "";
        });
        if (!rodando) renderizar();
      }
    };
  }

  window.CampoCena = { iniciar };
})();
