const fs = require('fs')
const path = require('path')
const glob = require('glob')
const TemplateEngine = require('./template-engine')

module.exports = class HtmlPagesGenerator {
    constructor(options, env) {
        this.env = env;
        this.pages = [];
        this.changedFiles = [];
        this.options = options || {};
    }

    compiler(compiler) {
        if (this.env == 'development') {
            this.runDevelopment(compiler);
        } else {
            this.runProduction(compiler);
        }
    }

    runProduction(compiler) {
        compiler.hooks.thisCompilation.tap('HtmlPagesGenerator', (compilation) => {
            const args = {
                name: 'HtmlPagesGenerator',
                stage: compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE
            };

            compilation.hooks.afterProcessAssets.tap(args, (assets) => {
                this.deleteAssets(compilation, assets);
                this.getPages();
                this.initPages(compilation);
            });
        });

        compiler.hooks.done.tap('HtmlPagesGenerator', () => {
            this.buildPages();
        });
    }

    runDevelopment(compiler) {
        compiler.hooks.watchRun.tap('HtmlPagesGenerator', (compilation) => {
            if (compilation.modifiedFiles) {
                this.changedFiles = Array.from(compilation.modifiedFiles, (file) => file.replace(/\\/g, '/'));
            }

            if (compilation.fileTimestamps) {
                this.checkRemovedPages(compilation.fileTimestamps);
            }
        });

        compiler.hooks.thisCompilation.tap('HtmlPagesGenerator', (compilation) => {
            const args = {
                name: 'HtmlPagesGenerator',
                stage: compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE
            }

            compilation.hooks.afterProcessAssets.tap(args, (assets) => {
                if (this.changedFiles != undefined && this.changedFiles.length > 0) {
                    const matches = this.changedFiles.filter(s => s.includes('.html'));
                    var build = false;

                    if (matches.length > 0) {
                        build = true;
                    }

                    this.changedFiles = [];

                    if (build) {
                        this.getPages();
                        this.initPages(compilation);
                        this.buildPages();
                    }
                } else {
                    this.getPages();
                    this.initPages(compilation);
                    this.buildPages();
                }
            });
        });
    }

    getPages() {
        const self = this;
        const options = this.options;
        const htmlPages = glob.sync(options.pagesPath + '/**/*.html');

        self.pages = [];

        htmlPages.map(function (file) {
            var publicPath = './';
            var pagesFolderPath = options.pagesPath.replace(/\\/g, '/');
            var filename = file.replace(pagesFolderPath, '').trim();
            var html = fs.readFileSync(file, { encoding: 'utf-8' });

            if (filename.charAt(0) == '/') {
                filename = filename.slice(1);
            }

            if (filename != '') {
                var slash = filename.split('/');

                if (slash.length > 1) {
                    publicPath = '';

                    for (let index = 1; index < slash.length; index++) {
                        publicPath += '../';
                    }
                }
            }

            self.pages.push({
                styleTags: [],
                scriptTags: [],
                file: path.resolve(options.publicPath, filename),
                fileName: filename,
                publicPath: publicPath,
                html: html,
                hash: true,
                scriptLoading: 'defer',
                chunks: 'all',
                excludeChunks: null,
            });
        });
    }

    initPages(compilation) {
        const self = this;
        const entryNames = Array.from(compilation.entrypoints.keys());

        this.pages.map(function (options) {
            const html = options.html;
            const hash = options.hash;
            const chunks = options.chunks;
            const excludeChunks = options.excludeChunks;
            const scriptLoading = options.scriptLoading;

            const filteredEntryNames = self.filterChunks(entryNames, chunks, excludeChunks);
            const assets = self.getAssets(compilation, filteredEntryNames, options.publicPath, hash);
            options.styleTags = self.generateStyleTags(assets.css);
            options.scriptTags = self.generatedScriptTags(assets.js, scriptLoading);

            if (html != undefined && html != '') {
                const templateEngine = new TemplateEngine(self.options);
                options.html = templateEngine.parsePage(options);
            }
        });
    }

    buildPages() {
        const self = this;
        const mainPath = this.options.path;
        const publicPathName = this.options.publicPath.replace(mainPath, '').replace(/\\/g, '/').slice(1);

        this.pages.map(function (options) {
            const html = options.html;
            const file = options.file;
            const fileName = publicPathName + '/' + options.fileName;

            if (html != undefined && html != '') {
                const templateEngine = new TemplateEngine(self.options);
                options.html = templateEngine.parsePage(options);
            }

            if (fs.existsSync(file)) {
                fs.writeFile(file, options.html, function (error) {
                    if (error) {
                        console.log("<i> [HtmlPagesGenerator] Update file: \x1b[32m" + fileName, "\x1b[31m " + error, "\x1b[0m");
                    } else {
                        console.log("<i> [HtmlPagesGenerator] Update file: \x1b[32m" + fileName, "\x1b[33m[code generated]", "\x1b[0m");
                    }
                });
            } else {
                const dirname = path.dirname(file);
                const exist = self.isDirExists(dirname);

                if (!exist) {
                    fs.mkdirSync(dirname, { recursive: true });
                }

                fs.writeFile(file, options.html, function (error) {
                    if (error) {
                        console.log("<i> [HtmlPagesGenerator] Create file: \x1b[32m" + fileName, "\x1b[31m[error] " + error, "\x1b[0m");
                    }
                    console.log("<i> [HtmlPagesGenerator] Create file: \x1b[32m" + fileName, "\x1b[33m[code generated]", "\x1b[0m");
                });
            }
        });
    }

    getAssets(compilation, entryNames, publicPath, hash) {
        const compilationHash = compilation.hash;

        const assets = {
            publicPath,
            js: [],
            css: [],
        };

        // Extract paths to .js, .mjs and .css files from the current compilation
        const entryPointPublicPathMap = {};
        const extensionRegexp = /\.(css|js|mjs)(\?|$)/;

        for (let i = 0; i < entryNames.length; i++) {
            const entryName = entryNames[i];
            /** entryPointUnfilteredFiles - also includes hot module update files */
            const entryPointUnfilteredFiles = compilation.entrypoints.get(entryName).getFiles();

            const entryPointFiles = entryPointUnfilteredFiles.filter((chunkFile) => {
                // compilation.getAsset was introduced in webpack 4.4.0
                // once the support pre webpack 4.4.0 is dropped please
                // remove the following guard:
                const asset = compilation.getAsset && compilation.getAsset(chunkFile);

                if (!asset) {
                    return true;
                }

                // Prevent hot-module files from being included:
                const assetMetaInformation = asset.info || {};
                return !(assetMetaInformation.hotModuleReplacement || assetMetaInformation.development);
            });

            // Prepend the publicPath and append the hash depending on the
            // webpack.output.publicPath and hashOptions
            // E.g. bundle.js -> /bundle.js?hash
            const entryPointPublicPaths = entryPointFiles
                .map(chunkFile => {
                    const entryPointPublicPath = publicPath + this.urlencodePath(chunkFile);
                    return hash
                        ? this.appendHash(entryPointPublicPath, compilationHash)
                        : entryPointPublicPath;
                });

            entryPointPublicPaths.forEach((entryPointPublicPath) => {
                const extMatch = extensionRegexp.exec(entryPointPublicPath);
                // Skip if the public path is not a .css, .mjs or .js file
                if (!extMatch) {
                    return;
                }
                // Skip if this file is already known
                // (e.g. because of common chunk optimizations)
                if (entryPointPublicPathMap[entryPointPublicPath]) {
                    return;
                }
                entryPointPublicPathMap[entryPointPublicPath] = true;
                // ext will contain .js or .css, because .mjs recognizes as .js
                const ext = extMatch[1] === 'mjs' ? 'js' : extMatch[1];
                assets[ext].push(entryPointPublicPath);
            });
        }

        return assets;
    }

    deleteAssets(compilation, assets) {
        for (let file in assets) {
            const asset = compilation.getAsset(file);
            const contents = asset.source.source();

            if (file != undefined && file.length > 3) {
                const ext3 = file.substr(file.length - 3);

                if (ext3 != undefined && ext3 == '.js' && contents != undefined && typeof contents === 'string') {
                    var string = contents.replace(/(\r\n|\n|\r)/gm, "");

                    if (string.replace(/\s/g, '') == '') {
                        compilation.deleteAsset(file);
                        console.log("<i> [HtmlPagesGenerator] Delete asset file: \x1b[32m" + file, "\x1b[33m[file is empty]", "\x1b[0m");
                    }
                }
            }

            if (file != undefined && file.length > 4) {
                const ext4 = file.substr(file.length - 4);

                if (ext4 != undefined && ext4 == '.css' && contents != undefined && typeof contents === 'string') {
                    var string = contents.replace(/(\r\n|\n|\r)/gm, "");

                    if (string.replace(/\s/g, '') == '') {
                        compilation.deleteAsset(file);
                        console.log("<i> [HtmlPagesGenerator] Delete asset file: \x1b[32m" + file, "\x1b[33m[file is empty]", "\x1b[0m");
                    }
                }
            }
        }
    }

    appendHash(url, hash) {
        if (!url) {
            return url;
        }
        return url + (url.indexOf('?') === -1 ? '?' : '&') + hash;
    }

    urlencodePath(filePath) {
        const queryStringStart = filePath.indexOf('?');
        const urlPath = queryStringStart === -1 ? filePath : filePath.substr(0, queryStringStart);
        const queryString = filePath.substr(urlPath.length);
        // Encode all parts except '/' which are not part of the querystring:
        const encodedUrlPath = urlPath.split('/').map(encodeURIComponent).join('/');
        return encodedUrlPath + queryString;
    }

    filterChunks(chunks, includedChunks, excludedChunks) {
        return chunks.filter(chunkName => {
            // Skip if the chunks should be filtered and the given chunk was not added explicity
            if (Array.isArray(includedChunks) && includedChunks.indexOf(chunkName) === -1) {
                return false;
            }

            // Skip if the chunks should be filtered and the given chunk was excluded explicity
            if (Array.isArray(excludedChunks) && excludedChunks.indexOf(chunkName) !== -1) {
                return false;
            }

            // Add otherwise
            return true;
        });
    }

    generatedScriptTags(jsAssets, scriptLoading) {
        return jsAssets.map(scriptAsset => ({
            tagName: 'script',
            attributes: {
                defer: scriptLoading === 'defer',
                type: scriptLoading === 'module' ? 'module' : undefined,
                src: scriptAsset
            }
        }));
    }

    generateStyleTags(cssAssets) {
        return cssAssets.map(styleAsset => ({
            tagName: 'link',
            attributes: {
                href: styleAsset,
                rel: 'stylesheet'
            }
        }));
    }

    checkRemovedPages(objects) {
        const pagesPath = this.options.pagesPath;
        const publicPath = this.options.publicPath;

        objects.forEach((value, file) => {
            if (file.length >= pagesPath.length) {
                const subPathName = file.substring(0, pagesPath.length);

                if (subPathName == pagesPath && value === null) {
                    var pathFile = file.replace(pagesPath, '');

                    if (pathFile.charAt(0) == '/' || pathFile.charAt(0) == '\\') {
                        pathFile = pathFile.slice(1);
                    }

                    const publicFile = path.resolve(publicPath, pathFile);

                    if (fs.existsSync(publicFile)) {
                        const isDir = this.isDir(publicFile);

                        if (isDir) {
                            this.removeDir(publicFile, true);
                        } else {
                            fs.unlinkSync(publicFile);
                        }
                    }
                }
            }
        });
    }

    isDirExists(path) {
        if (fs.existsSync(path)) {
            return true;
        }

        return false;
    }

    isDir(path) {
        try {
            var stat = fs.lstatSync(path);
            return stat.isDirectory();
        } catch (e) {
            return false;
        }
    }

    removeDir(dirPath, removeSelf) {
        try {
            var files = fs.readdirSync(dirPath);
        } catch (e) {
            return;
        }

        if (files.length > 0) {
            for (var i = 0; i < files.length; i++) {
                var filePath = dirPath + '/' + files[i];
                if (fs.statSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
                else {
                    this.removeDir(filePath);
                }
            }
        }

        if (removeSelf) {
            fs.rmdirSync(dirPath);
        }
    }
}