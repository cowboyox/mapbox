function FrameBench(urls, duration, setup, teardown, done) {

    var queryString = window.location.href.split('?')[1];
    var versionNum = parseInt(queryString && queryString.split('/')[0], 10);
    var base = window.location.href.split('?')[0];

    // make refresh restart
    if (versionNum) {
        var previous = localStorage.lastVersion;
        if (previous && JSON.parse(previous) === versionNum) {
            versionNum = NaN;
        }
    }
    localStorage.lastVersion = JSON.stringify(versionNum);

    var endTime;
    var state = {};
    var frames = [];

    if (versionNum < urls.length) {
        console.log('number', versionNum);
        var url = urls[versionNum];
        var script = document.createElement('script');
        script.src = url;
        document.body.appendChild(script);
        script.onload = setupBenchmark;

    } else if (versionNum) {
        console.log('done');
        done(JSON.parse(localStorage.results));

    } else {
        console.log('starting');
        localStorage.results = JSON.stringify([]);
        next();
    }

    function setupBenchmark() {
        setup(state, function() {
            endTime = Date.now() + duration;
            window.requestAnimationFrame(onFrame);
        });
    }

    function onFrame() {
        var now = Date.now();

        frames.push(now);

        if (now < endTime) {
            window.requestAnimationFrame(onFrame);
        } else {
            teardown(state, endBenchmark);
        }
    }

    function endBenchmark() {
        var results = JSON.parse(localStorage.results);
        results[versionNum] = frames;
        localStorage.results = JSON.stringify(results);
        next();
    }

    function next() {
        var num = isNaN(versionNum) ? 0 : versionNum + 1;
        window.location.href = base + '?' + num;
    }
}
