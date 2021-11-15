const fs = require('fs')
const path = require('path')
const beautify = require('js-beautify')
const minify = require('html-minifier').minify

module.exports = class TemplateEngine {
    constructor(config, options = null, pass_files = null) {
        this.html = '';
        this.options = {};
        this.config = config || {};
        this.pass_files = pass_files ? pass_files : [];
        this.data = {
            layout: {},
            for: [],
            foreach: [],
            switch: [],
            ifelse: [],
            includes: [],
            style_tags: '',
            script_tags: '',
        };

        if (options != undefined && options !== null) {
            this.options = options;
        } else {
            this.options = this.defaultOptions();
        }
    }

    defaultOptions() {
        return {
            '$base_url': './',
            '$base_path': './',
            '$assets_url': './assets',
            '$file': '',
            '$file_name': '',
            '$content': '',
            '$load:css': '',
            '$load:js': '',
        };
    }

    parsePage(data, beautify = true) {
        const html = data.html;
        const file = data.file;
        const fileName = data.fileName;
        const publicPath = data.publicPath;
        const styleTags = data.styleTags;
        const scriptTags = data.scriptTags;

        this.parseTags(styleTags);
        this.parseTags(scriptTags);

        this.options['$file'] = file;
        this.options['$file_name'] = fileName;
        this.options['$base_url'] = publicPath;
        this.options['$base_path'] = publicPath;
        this.options['$assets_url'] = publicPath + 'assets';

        this.options['$load:js'] = this.data['script_tags'];
        this.options['$load:css'] = this.data['style_tags'];

        this.html = this.minify(html);
        this.html = this.parseOptions(this.html, this.options);

        this.parseData(true);
        this.parseLayout();

        return (beautify === true) ? this.beautify(this.html) : this.html;
    }

    parseFile(html, beautify = true) {
        this.html = this.minify(html);
        this.html = this.parseOptions(this.html, this.options);
        this.parseData();

        return (beautify === true) ? this.beautify(this.html) : this.html;
    }

    parseData(withLayout) {
        if (this.html != undefined && this.html != '') {
            const commented = this.html.match(/<!--([\s\S]<|<)fkit(.*?)-->/g);

            if (commented != undefined && commented !== null) {
                for (const key in commented) {
                    if (Object.hasOwnProperty.call(commented, key)) {
                        const element = commented[key];
                        this.html = this.html.replace(element, '');
                    }
                }
            }

            const includes = this.html.match(/<fkit[\s\S]include=(.*?)>/g);
            const sections = this.html.match(/<fkit[\s\S]section=(.*?)>/g);

            const forloop = this.html.match(/<fkit[\s\S]for=(.*?)<\/fkit>/g);
            const foreach = this.html.match(/<fkit[\s\S]foreach=(.*?)<\/fkit>/g);

            const ifexp = this.html.match(/<fkit[\s\S]if=(.*?)<\/fkit>/g);
            const ifelse = this.html.match(/<fkit[\s\S]ifelse(.*?)<\/fkit>/g);
            const switchexp = this.html.match(/<fkit[\s\S]switch=(.*?)<\/fkit>/g);

            if (withLayout === true) {
                const layouts = this.html.match(/<fkit[\s\S]layout=(.*?)>/g);
                this.parseEachTag(layouts, 'layout');
            }

            this.parseEachTag(includes, 'include');
            this.parseEachTag(sections, 'section');

            this.parseExpression(ifexp, 'if');
            this.parseExpression(ifelse, 'ifelse');
            this.parseExpression(switchexp, 'switch');

            this.parseLoop(forloop, 'for');
            this.parseLoop(foreach, 'foreach');
        }
    }

    parseEachTag(objects, type) {
        if (objects != undefined && objects !== null) {
            for (const i in objects) {
                if (Object.hasOwnProperty.call(objects, i)) {
                    var element = objects[i];
                    var attrs = this.parseTagAttrs(element);

                    if (attrs != undefined && attrs !== null) {
                        var filename = '';
                        var filedata = {};

                        if (type == 'layout') {
                            var layout = attrs.layout;
                            delete attrs.layout;

                            layout = layout.replace('.html', '');

                            if (layout.charAt(0) == '/' || layout.charAt(0) == '\\') {
                                layout = layout.slice(1);
                            }

                            this.data.layout.name = layout;
                            this.data.layout.options = attrs;
                            this.html = this.html.replace(element, '');
                        } else if (type == 'include') {
                            filename = attrs.include;
                            delete attrs.include;

                            filedata = {
                                file: filename,
                                options: attrs,
                            }
                        } else if (type == 'section') {
                            filename = 'sections/' + attrs.section;
                            delete attrs.section;

                            filedata = {
                                file: filename,
                                options: attrs,
                            }
                        }

                        if (filename) {
                            filename = filename.replace('.html', '');

                            if (filename.charAt(0) == '/' || filename.charAt(0) == '\\') {
                                filename = filename.slice(1);
                            }

                            filename = path.resolve(this.config.srcPath, filename + '.html');

                            if (fs.existsSync(filename)) {
                                filedata.file = filename;
                                this.data.includes.push(filedata);
                                this.parseInclude(element, filedata);
                            } else {
                                this.html = this.html.replace(element, '');
                            }
                        }
                    }
                }
            }
        }
    }

    parseInclude(tag, data) {
        if (this.html != undefined && this.html != '' && data != undefined) {
            var html = '';
            var file = data.file;
            var options = data.options;
            var runself = this.passFile(file);

            if (runself) {
                html = fs.readFileSync(file, { encoding: 'utf-8' });

                if (html) {
                    html = this.minify(html);
                    html = this.parseOptions(html, options);
                    const fkit = html.match(/<fkit[\s\S](.*?)>/g);

                    if (fkit != undefined && fkit !== null) {
                        this.pass_files.push(file);
                        const engine = new TemplateEngine(this.config, this.options, this.pass_files);

                        html = engine.parseFile(html, false);
                        this.pass_files = [];
                    }
                }
            }

            this.html = this.html.replace(tag, html);
        }
    }

    parseLayout() {
        if (this.html != undefined && this.html != '') {
            var html = '';

            if (this.data != undefined && this.data.layout && Object.keys(this.data.layout).length > 0) {
                var layout = this.data.layout;
                var file = path.resolve(this.config.srcPath, 'layouts/' + layout.name + '.html');

                if (fs.existsSync(file)) {
                    html = fs.readFileSync(file, { encoding: 'utf-8' });
                }

                if (html) {
                    this.options['$content'] = this.html;
                    html = this.minify(html);
                    html = this.parseOptions(html, layout.options);

                    const engine = new TemplateEngine(this.config, this.options);
                    html = engine.parseFile(html, false);
                }
            }

            if (html != undefined && html != '') {
                this.html = html;
            }
        }
    }

    parseOptions(html, options) {
        if (html != undefined && html != '') {
            const matches = html.match(/{{(.*?)}}/g);

            if (matches != undefined && matches !== null) {
                for (const i in matches) {
                    if (Object.hasOwnProperty.call(matches, i)) {
                        var key = matches[i];
                        var tag = matches[i];

                        if (key) {
                            key = key.replace('{{', '');
                            key = key.replace('{{', '');
                            key = key.replace('}}', '');
                            key = key.trim();
                        }

                        if (this.options != undefined && this.options[key] != undefined) {
                            html = html.replace(tag, this.options[key]);
                        } else if (options != undefined && options[key] != undefined) {
                            html = html.replace(tag, options[key]);
                        }
                    }
                }
            }
        }

        return this.minify(html);
    }

    parseTagAttrs(html) {
        var data = {};

        if (html != undefined && html != '') {
            html = html.replace('<fkit', '');
            var attrs = html.match(/(.*?)=(\"|\')(.*?)(\"|\')/g);

            if (attrs != undefined && attrs !== null) {
                for (const key in attrs) {
                    if (Object.hasOwnProperty.call(attrs, key)) {
                        var element = attrs[key].trim();
                        var array = element.split("=");

                        if (array != undefined && array.length > 0) {
                            var attr_key = array[0];
                            var attr_value = '';

                            if (array[1] != undefined && array[1] != '') {
                                attr_value = array[1].substring(1);
                                attr_value = attr_value.substring(0, attr_value.length - 1);
                            }

                            data[attr_key] = attr_value;
                        }
                    }
                }
            }
        }

        return data;
    }

    parseExpression(objects, type) {
        if (objects != undefined && objects !== null) {
            for (const i in objects) {
                if (Object.hasOwnProperty.call(objects, i)) {
                    const element = objects[i];

                    if (type == 'switch') {
                        this.data.switch.push(element);
                    } else {
                        this.data.ifelse.push(element);
                    }

                    this.html = this.html.replace(element, '');
                }
            }
        }
    }

    parseLoop(objects, type) {
        if (objects != undefined && objects !== null) {
            for (const i in objects) {
                if (Object.hasOwnProperty.call(objects, i)) {
                    const element = objects[i];

                    if (type == 'for') {
                        this.data.for.push(element);
                    } else if (type == 'foreach') {
                        this.data.foreach.push(element);
                    }

                    this.html = this.html.replace(element, '');
                }
            }
        }
    }

    passFile(file) {
        var output = true;

        if (this.pass_files != undefined && this.pass_files !== null && this.pass_files.includes(file)) {
            output = false;
        }

        return output;
    }

    parseTags(array) {
        if (array != undefined && array !== null) {
            array.forEach(element => {
                const tagName = element.tagName;
                const attributes = element.attributes;

                if (tagName == 'link') {
                    var tag_attrs = [];
                    const rel = attributes.rel;
                    const href = attributes.href;

                    if (href != undefined && href != '') {
                        tag_attrs.push('href="' + href + '"');

                        if (rel != undefined && rel != '') {
                            tag_attrs.push('rel="' + rel + '"');
                        } else {
                            tag_attrs.push('rel="stylesheet"');
                        }

                        this.data['style_tags'] += '<link ' + tag_attrs.join(' ') + '>';
                    }
                } else if (tagName == 'script') {
                    var tag_attrs = [];
                    const src = attributes.src;
                    const type = attributes.type;
                    const defer = attributes.defer;

                    if (src != undefined && src != '') {
                        tag_attrs.push('src="' + src + '"');

                        if (defer != undefined && defer) {
                            tag_attrs.push('defer');
                        }

                        if (type != undefined && type != '') {
                            tag_attrs.push('type="' + type + '"');
                        }

                        this.data['script_tags'] += '<script ' + tag_attrs.join(' ') + '></script>';
                    }
                }
            });
        }
    }

    minify(html) {
        return minify(html, {
            minifyJS: true,
            minifyCSS: true,
            collapseWhitespace: true,
            ignoreCustomFragments: [/<%[\s\S]*?%>/, /<\?[\s\S]*?\?>/, /<fkit[\s\S]*?\/>/],
        });
    }

    beautify(html) {
        return beautify.html(html);
    }
}