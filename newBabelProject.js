const fs = require('fs');
const path = require('path');
const spawn = require('cross-spawn');
const pkginfo = require('package-info');

async function cmd(cmd, print) {
    return new Promise((resolve, reject) => {
        if (print) {
            console.log(cmd);
        }

        const args = cmd.split(' ');

        const child = spawn(args[0], args.slice(1));

        let out = '';
        child.stdout.on('data', (data) => {
            out += data.toString();
        });

        let err = '';
        child.stderr.on('data', (data) => {
            err += data.toString();
        });

        child.on('close', () => {
            if (err.length > 0) {
                reject(err);
            } else {
                resolve(out);
            }
        });
    });
}

async function version(pkg) {
    if (pkg.startsWith('_')) pkg = pkg.substring(1);
    const info = await pkginfo(pkg);
    return '^' + info.version;
}

function getVersions(opts) {
    const deps = ['babel-cli', 'babel-preset-env', 'rimraf'];
    if (opts.react) {
        deps.push('parcel-bundler');
        deps.push('_react', '_react-dom');
    }
    if (opts.flow) {
        deps.push('babel-preset-flow', 'flow-bin');
        if (opts.publish) {
            deps.push('flow-copy-source');
        }
    }
    if (opts.eslint) {
        deps.push('eslint');
        if (opts.flow) {
            deps.push('eslint-plugin-flowtype', 'babel-eslint');
        }
    }
    if (opts.mocha) {
        deps.push('mocha', 'chai');
        if (opts.eslint) {
            deps.push('eslint-plugin-mocha');
        }
    }
    if (opts.publish) {
        deps.push('babel-plugin-add-module-exports');
    }
    if (opts.executable) {
        deps.push('babel-watch');
    }
    const versionProm = Promise.all(deps.map(dep => version(dep)));
    return { deps, versionProm };
}

function babelrc(opts, cwd) {
    const babelrc = {
        presets: [
            ["env", {
                targets: {node: "current"}
            }]
        ]
    };
    if (opts.flow) {
        babelrc.presets.unshift('flow');
    }
    if (opts.publish) {
        babelrc.plugins = ['add-module-exports'];
    }
    fs.writeFileSync(path.join(cwd, '.babelrc'), JSON.stringify(babelrc, null, 2));
}

function readme(opts, cwd) {
    const name = path.basename(cwd);
    let content = `# ${name}
Description

## Todo`;

    if (opts.flow) {
        content += '\n### Flow\n```bash\nnpm run flow -- init\n```';
    }

    if (opts.eslint) {
        content += '\n### ESLint\n```bash\nnpm run lint -- --init\n```';
        if (opts.flow) {
            content += `
Edit .eslintrc
\`\`\`json
{
  "extends": {
    ...
    "plugin:flowtype/recommended"
  },
  "parser": "babel-eslint",
  "plugins": [
    "flowtype"
  ],
  ...
}
\`\`\``;
        }
        if (opts.mocha) {
            content += `
Create test/.eslintrc
\`\`\`json
{
  ...
  "plugins": [
    "mocha"
  ],
  "env": {
    "mocha": true
  }
}
\`\`\``;
        }
    }

    fs.writeFileSync(path.join(cwd, 'README.md'), content);
}

function mainjs(opts, cwd) {
    if (!opts.executable) return;

    fs.writeFileSync(path.join(cwd, 'src', 'main.js'), "console.log('Hello world!');\n");
}

function reactStuff(opts, cwd) {
    if (!opts.react) return;

    fs.writeFileSync(path.join(cwd, 'src', 'index.jsx'), `import React from 'react';
import ReactDOM from 'react-dom';

ReactDOM.render(<div>Hello world</div>, document.getElementById('root'));

// Hot Module Replacement
if (module.hot) {
  module.hot.accept();
}`);

    fs.mkdirSync(path.join(cwd, 'public'));

    fs.writeFileSync(path.join(cwd, 'public', 'index.html'), `<html>
<body>
  <div id="root"></div>
  <script src="../src/index.jsx"></script>
</body>
</html>
`);
}

function gitignore(opts, cwd) {
    let content = `/node_modules/
/dist/`;
    if (opts.react) {
        content += '\n/.cache/';
    }
    fs.writeFileSync(path.join(cwd, '.gitignore'), content);
}

async function newBabelProject(opts) {
    const cwd = process.cwd();
    const packageJson = path.join(cwd, 'package.json');

    // Start getting dependency versions
    const { deps, versionProm } = getVersions(opts);

    // Start creating package.json
    let packageJsonProm;
    if (!fs.existsSync(packageJson)) {
        packageJsonProm = cmd('npm init -y', true);
    }

    // src
    const srcDir = path.join(cwd, 'src');
    if (!fs.existsSync(srcDir)) {
        fs.mkdirSync(srcDir);
    }

    // test
    if (opts.mocha) {
        const testDir = path.join(cwd, 'test');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir);
        }
    }

    // .babelrc
    babelrc(opts, cwd);

    // README.md
    readme(opts, cwd);

    // main.js
    mainjs(opts, cwd);

    // .gitignore
    gitignore(opts, cwd);

    // react stuff
    reactStuff(opts, cwd);

    // Add dependencies
    console.log('Getting versions of dependencies');
    const versions = await versionProm;

    if (packageJsonProm) await packageJsonProm;

    const json = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    if (!('devDependencies' in json)) json.devDependencies = {};
    if (!('dependencies' in json)) json.dependencies = {};
    deps.forEach((dep, idx) => {
        if (dep.startsWith('_')) {
            json.dependencies[dep.substring(1)] = versions[idx];
        } else {
            json.devDependencies[dep] = versions[idx];
        }
    });

    if (!('scripts' in json)) json.scripts = {};

    if (opts.react) {
        json.scripts.build = 'parcel build src/index.jsx';
        json.scripts.start = 'parcel public/index.html';
    } else {
        json.scripts.build = `rimraf ./dist && babel src/ ${opts.mocha ? 'test/ ' : ''}-d dist --copy-files`;
    }
    if (opts.executable) {
        json.scripts.start = 'babel-watch --watch src src/main.js';
    }
    if (opts.publish) {
        json.scripts.prepare = 'npm run build';
        if (opts.flow) json.scripts.prepare += ' && flow-copy-source src dist';
    }
    if (opts.flow) {
        json.scripts.flow = 'flow';
    }
    if (opts.eslint) {
        json.scripts.lint = 'eslint src/**';
        if (opts.mocha) json.scripts.lint += ' test/**';
    }
    if (opts.flow && opts.eslint) {
        json.scripts.flint = 'npm run flow && npm run lint';
    }
    if (opts.mocha) {
        json.scripts.test = 'npm run build && mocha dist/**/*.test.js';
    }

    console.log('Writing dependencies to package.json');
    fs.writeFileSync(packageJson, JSON.stringify(json, null, 2));
}

module.exports = newBabelProject;
