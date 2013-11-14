var util = llmr.util;


function App(root) {
    var app = this;

    this._setupStyleDropdown();
    this._setupMap();
    this._setupLayers();
    this._setupAddData();
}


App.prototype._setupStyleDropdown = function() {
    var app = this;

    var dropdown = this.dropdown = new Dropdown($('#styles'));

    $("#new-style-template").dialog({
        autoOpen: false,
        modal: true,
        draggable: false,
        title: "Create New Style",
        width: 350,
        height: 120,
        buttons: [{ text: "Create", type: "submit" }],
        open: function(){
            $(this).unbind('submit').submit(function() {
                var name = $(this).find('#new-style-name').val();
                if (name) {
                    list.select(list.create(defaultStyle, name));
                    $(this).dialog("close");
                }
                return false;
            });
        },
        close: function() {
            $(this).find('#new-style-name').val("");
        }
    });

    $('#add-style').click(function() {
        $("#new-style-template").dialog("open");
    });

    var list = new StyleList();
    bean.on(list, {
        'add': function(name) {
            dropdown.add(name.replace(/^llmr\/styles\//, ''), name);
        },
        'change': function(name, style) {
            app.setStyle(style);
            dropdown.select(name);
        },
        'load': function() {
            if (!list.active) {
                $("#new-style-template").dialog("open");
            } else {
                list.select(list.active);
            }
        }
    });

    $(dropdown)
        .on('item:select', function(e, name) {
            list.select(name);
        })
        .on('item:remove', function(e, name) {
            list.remove(name);
        });
};

App.prototype._setupMap = function() {
    var app = this;

    this.map = new llmr.Map({
        container: document.getElementById('map'),
        layers: [{
            type: 'vector',
            id: 'streets',
            urls: ['/gl/tiles/{z}-{x}-{y}.vector.pbf'],
            zooms: [0, 2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 14]
        }],
        maxZoom: 20,
        zoom: 15,
        lat: 38.912753,
        lon: -77.032194,
        rotation: 0,
        hash: true,
        style: {}
    });

    this.map.on('layer.add', function(layer) {
        layer.on('tile.load.sidebar tile.remove.sidebar', function() {
            app.updateStats(layer.stats());
        });
        app.updateStats(layer.stats());
    });
};

App.prototype._setupLayers = function() {
    var app = this;
    var root = $('#layers');
    root.sortable({
        axis: "y",
        items: ".layer:not(.background)",
        handle: ".handle-icon",
        cursor: "-webkit-grabbing",
        change: function(e, ui) {
            var placeholder = ui.placeholder[0];
            var item = ui.item[0];

            var order = [];
            root.find(root.sortable("option", "items")).each(function(i, layer) {
                if (layer == item) return;
                order.push($(layer == placeholder ? item : layer).attr('data-id'));
            });
            app.style.setLayerOrder(order);
        }
    });
};

App.prototype._setupAddData = function() {
    var app = this;

    // Switch between sidebars.
    $('#add-data').click(function() {
        $('.sidebar').removeClass('visible').filter('#data-sidebar').addClass('visible');
    });
    $('#data-sidebar .close-sidebar').click(function() {
        $('.sidebar').removeClass('visible').filter('#layer-sidebar').addClass('visible');
    });

    // Expand and collapse the layers.
    $('#data-sidebar')
        .on('click', 'input.source-layer', function() {
            $(this).closest('li.source-layer').siblings().removeClass('expanded');
            $(this).closest('li.source-layer').addClass('expanded');
        })

        .on('click', 'input.feature-name', function() {
            $(this).closest('li.feature-name').siblings().removeClass('expanded');
            $(this).closest('li.feature-name').addClass('expanded')
        });


    this.filter = new DataFilterView($('#data-sidebar .layers'));
    $('#add-data-form').submit(function() {
        var name = $('#add-data-name').val();
        var bucket = app.filter.selection();
        var type = $('[name=data-geometry-type]:checked').val();

        if (name && bucket && type) {
            if (app.style.buckets[name]) {
                alert("This name is already taken");
                return false;
            }

            bucket.type = type;

            var layer = { bucket: name, color: '#FF0000' };
            switch (bucket.type) {
                case 'fill': layer.antialias = true; break;
                case 'line': layer.width = ["stops"]; break;
            }

            app.style.addBucket(name, bucket);
            app.style.addLayer(layer);

            $('#data-sidebar .close-sidebar').click();
            var view = app.createLayerView(layer, bucket);
            $('#layers').append(view.root);
            view.activate();
            app.layerViews.push(view);
        }

        return false;
    });
};


App.prototype.setStyle = function(style) {
    var app = this;
    this.style = style;
    this.backgroundView = null;
    this.layerViews = [];

    // Enable/Disable the interface
    $('body').toggleClass('no-style-selected', !style);

    $('#layers').empty();

    if (style) {
        bean.on(style, 'change', function() {
            app.updateStyle();
        });
        bean.on(style, 'buckets', function() {
            app.updateBuckets();
        });

        // Background layer
        var background = this.createLayerView({ color: to_css_color(style.background) }, { type: 'background' });
        $('#layers').append(background.root);
        this.backgroundView = background;

        // Actual layers
        for (var i = 0; i < style.layers.length; i++) {
            var layer = style.layers[i];
            var bucket = style.buckets[layer.bucket];
            var view = this.createLayerView(layer, bucket);
            $('#layers').append(view.root);
            this.layerViews.push(view);
        }

        this.updateBuckets();
        this.updateStyle();
    }
};

App.prototype.createLayerView = function(layer, bucket) {
    var app = this;
    var view = new LayerView(layer, bucket);
    bean.on(view, 'activate', function() {
        _.each(app.layerViews, function(otherView) {
            if (otherView !== view) {
                otherView.deactivate();
            }
        });
    });
    bean.on(view, 'remove', function() {
        _.remove(app.layerViews, function(otherView) {
            return view == otherView;
        });
    });
    return view;
};

App.prototype.updateStyle = function() {
    this.map.setLayerStyles(this.style.presentationLayers());
};

App.prototype.updateBuckets = function() {
    this.map.setBuckets(this.style.presentationBuckets());
};

App.prototype.updateStats = function(stats) {
    this.filter.update(stats);

    _.each(this.layerViews, function(view) {
        var count = 0;
        var info = stats[view.bucket.layer];

        if (!info) {
            view.setCount(0);
            return;
        }

        if (view.bucket.field) {
            // Count the selected fields
            var field = info[view.bucket.field];
            if (Array.isArray(view.bucket.value)) {
                for (var i = 0; i < view.bucket.value.length; i++) {
                    count += field[view.bucket.value[i]] || 0;
                }
            } else {
                count = field[view.bucket.value] || 0;
            }

        } else {
            // Use the entire layer count.
            count = info['(all)'];
        }

        view.setCount(count);
    });
}
