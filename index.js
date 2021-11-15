const fs = require('fs')
const path = require('path')
const HtmlPagesGenerator = require('./html-pages-generator')

module.exports = class Fkit {
    constructor(options) {
        this.options = options;
        this.env = options.env;
        this.path = options.path;
        this.config = this.pathConfig();
        this.initApp();
    }

    pathConfig() {
        const mainPath = this.options.path;

        return {
            path: mainPath,
            srcPath: path.resolve(mainPath, 'src'),
            publicPath: path.resolve(mainPath, 'public'),
            pagesPath: path.resolve(mainPath, 'src/pages'),
            layoutsPath: path.resolve(mainPath, 'src/layouts'),
            sectionsPath: path.resolve(mainPath, 'src/sections'),
        }
    }

    apply(compiler) {
        new HtmlPagesGenerator(this.config, this.env).compiler(compiler);
    }

    initApp() {
        const pagesPath = this.config.pagesPath;
        const publicPath = this.config.publicPath;
        const layoutsPath = this.config.layoutsPath;
        const sectionsPath = this.config.sectionsPath;

        // Check pages path
        if (!fs.existsSync(pagesPath)) {
            fs.mkdirSync(pagesPath);
        }

        // Check layouts path
        if (!fs.existsSync(layoutsPath)) {
            fs.mkdirSync(layoutsPath);
        }

        // Check sections path
        if (!fs.existsSync(sectionsPath)) {
            fs.mkdirSync(sectionsPath);
        }

        // Check public path
        if (!fs.existsSync(publicPath)) {
            fs.mkdirSync(publicPath);
        }
    }
}