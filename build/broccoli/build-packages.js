const buildPackage = require('@glimmer/build');
const buildTestsIndex = require('@glimmer/build/lib/build-tests-index');
const plugins = require('@glimmer/build/lib/default-es5-plugins');
const funnel = require('broccoli-funnel');
const merge = require('broccoli-merge-trees');
const Filter = require('broccoli-persistent-filter');
const DAGMap = require('dag-map').default;
const glob = require('glob');
const path = require('path');
const writeFile = require('broccoli-file-creator');
const fs = require('fs');
const debugTree = require('broccoli-debug').buildDebugCallback('glimmer-vm');

const TSCONFIG_PATH = `${__dirname}/../../tsconfig.json`;
const PACKAGES_PATH = `${__dirname}/../../packages`;

/**
 * Find all packages in `packages/` directory and build them individually.
 * Builds are ordered by inverting the dependency tree, so a package's
 * dependencies should be ready by the time it is built.
 */
module.exports = function() {
  // Topographically sort packages, then create a @glimmer/build tree per
  // package.
  let packageTrees = topsortPackages()
    .map(packagePath => treeForPackage(packagePath));

  // Merge all packages together, completing the build.
  return merge(packageTrees);
}

function topsortPackages() {
  // Find all packages in `packages/` that have a `package.json` file, and load
  // that `package.json`.
  let pkgs = glob
    .sync(`${PACKAGES_PATH}/**/package.json`)
    .map(pkgPath => require(pkgPath));

  // Get a list of package names discovered in the repo.
  let inRepoDependencies = pkgs.map(pkg => pkg.name);

  let graph = new DAGMap();

  // For each package, get a list of in-repo packages it depends on, and add
  // them to the graph.
  pkgs
    .map(pkg => filterDependencies(pkg))
    .forEach(([pkg, deps]) => {
      graph.add(pkg.name, pkg, null, deps)
    });

  let sorted = [];

  // Get a topographically sorted list of packages.
  graph.each(pkg => sorted.push(`${PACKAGES_PATH}/${pkg}`));

  return sorted;

  function filterDependencies(pkg) {
    // Merge the package's dependencies and dev dependencies
    let dependencies = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {})
    ];

    // Filter out any dependencies that we didn't discover in the repo.
    dependencies = dependencies
      .filter(dep => inRepoDependencies.indexOf(dep) > -1);

    return [pkg, dependencies];
  }
}

/**
 * Returns a `@glimmer/build` Broccoli tree for a given path.
 *
 * @param {string} packagePath
 */
function treeForPackage(packagePath) {
  let pkg = require(packagePath + '/package');
  let packageName = pkg.name;

  let srcTrees = [
    debugTree(funnel(packagePath, { exclude: ['test/**/*'] }), `input-${packageName}`)
  ];

  let packageTree;

  if (fs.existsSync(path.join(packagePath, 'index.d.ts'))) {
    // @glimmer/interfaces only exports types, so we can copy it verbatim without
    // any transpilation.
    packageTree = funnel(packagePath, {
      destDir: path.join('dist', 'types'),
      exclude: ['package.json']
    });
  } else {
    packageTree = funnel(debugTree(buildPackage({
      srcTrees,
      projectPath: packagePath,
      tsconfigPath: TSCONFIG_PATH,
    }), `glimmer-build-out-${packageName}`), { destDir: 'dist' });
  }

  let packageJSONTree = treeForPackageJSON(packagePath);

  let license = writeFile('/LICENSE', fs.readFileSync('./LICENSE', 'utf8'));

  let tree = merge([packageTree, packageJSONTree, license]);

  // Convert the package's absolute path to a relative path so it shows up in
  // the right place in `dist`.
  let destDir = path.relative(PACKAGES_PATH, packagePath);

  return funnel(tree, { destDir });
}

const PACKAGE_JSON_FIELDS = {
  "main": "dist/commonjs/es5/index.js",
  "jsnext:main": "dist/modules/es5/index.js",
  "module": "dist/modules/es5/index.js",
  "typings": "dist/types/index.d.ts",
  "license": "MIT"
};

class PackageJSONRewriter extends Filter {
  canProcessFile(relativePath) {
    return relativePath === 'package.json';
  }

  processString(string, relativePath) {
    let pkg = JSON.parse(string);
    Object.assign(pkg, PACKAGE_JSON_FIELDS);
    return JSON.stringify(pkg, null, 2);
  }
}

function treeForPackageJSON(packagePath) {
  let packageJSONTree = funnel(packagePath, {
    include: ['package.json']
  });

  return new PackageJSONRewriter(packageJSONTree);
}
