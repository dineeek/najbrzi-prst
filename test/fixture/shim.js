(() => {
  const store = {
    async get(name) {
      const raw = localStorage.getItem('shim:' + name);
      return { [name]: raw ? JSON.parse(raw) : undefined };
    },
    async set(bag) {
      for (const [name, value] of Object.entries(bag))
        localStorage.setItem('shim:' + name, JSON.stringify(value));
    },
    async remove(name) {
      localStorage.removeItem('shim:' + name);
    }
  };
  window.__shimMessages = [];
  window.chrome = {
    runtime: {
      id: 'fixture',
      sendMessage: async message => {
        window.__shimMessages.push(message);
      },
      onMessage: { addListener() {}, removeListener() {} },
      getURL: path => path
    },
    storage: {
      local: store,
      onChanged: { addListener() {}, removeListener() {} }
    },
    i18n: { getMessage: () => '' }
  };
})();
