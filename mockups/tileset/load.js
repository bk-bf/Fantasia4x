'use strict';
document.write([...REGISTRY_SCRIPTS, ...document.currentScript.dataset.then.split(' ')].map(src => '<script src="' + src + '"><\/script>').join(''));
