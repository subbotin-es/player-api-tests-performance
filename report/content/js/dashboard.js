/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

/*
 * Add header in statistics table to group metrics by category
 * format
 *
 */
function summaryTableHeader(header) {
    var newRow = header.insertRow(-1);
    newRow.className = "tablesorter-no-sort";
    var cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 1;
    cell.innerHTML = "Requests";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 3;
    cell.innerHTML = "Executions";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 7;
    cell.innerHTML = "Response Times (ms)";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 1;
    cell.innerHTML = "Throughput";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 2;
    cell.innerHTML = "Network (KB/sec)";
    newRow.appendChild(cell);
}

/*
 * Populates the table identified by id parameter with the specified data and
 * format
 *
 */
function createTable(table, info, formatter, defaultSorts, seriesIndex, headerCreator) {
    var tableRef = table[0];

    // Create header and populate it with data.titles array
    var header = tableRef.createTHead();

    // Call callback is available
    if(headerCreator) {
        headerCreator(header);
    }

    var newRow = header.insertRow(-1);
    for (var index = 0; index < info.titles.length; index++) {
        var cell = document.createElement('th');
        cell.innerHTML = info.titles[index];
        newRow.appendChild(cell);
    }

    var tBody;

    // Create overall body if defined
    if(info.overall){
        tBody = document.createElement('tbody');
        tBody.className = "tablesorter-no-sort";
        tableRef.appendChild(tBody);
        var newRow = tBody.insertRow(-1);
        var data = info.overall.data;
        for(var index=0;index < data.length; index++){
            var cell = newRow.insertCell(-1);
            cell.innerHTML = formatter ? formatter(index, data[index]): data[index];
        }
    }

    // Create regular body
    tBody = document.createElement('tbody');
    tableRef.appendChild(tBody);

    var regexp;
    if(seriesFilter) {
        regexp = new RegExp(seriesFilter, 'i');
    }
    // Populate body with data.items array
    for(var index=0; index < info.items.length; index++){
        var item = info.items[index];
        if((!regexp || filtersOnlySampleSeries && !info.supportsControllersDiscrimination || regexp.test(item.data[seriesIndex]))
                &&
                (!showControllersOnly || !info.supportsControllersDiscrimination || item.isController)){
            if(item.data.length > 0) {
                var newRow = tBody.insertRow(-1);
                for(var col=0; col < item.data.length; col++){
                    var cell = newRow.insertCell(-1);
                    cell.innerHTML = formatter ? formatter(col, item.data[col]) : item.data[col];
                }
            }
        }
    }

    // Add support of columns sort
    table.tablesorter({sortList : defaultSorts});
}

$(document).ready(function() {

    // Customize table sorter default options
    $.extend( $.tablesorter.defaults, {
        theme: 'blue',
        cssInfoBlock: "tablesorter-no-sort",
        widthFixed: true,
        widgets: ['zebra']
    });

    var data = {"OkPercent": 0.0, "KoPercent": 100.0};
    var dataset = [
        {
            "label" : "FAIL",
            "data" : data.KoPercent,
            "color" : "#FF6347"
        },
        {
            "label" : "PASS",
            "data" : data.OkPercent,
            "color" : "#9ACD32"
        }];
    $.plot($("#flot-requests-summary"), dataset, {
        series : {
            pie : {
                show : true,
                radius : 1,
                label : {
                    show : true,
                    radius : 3 / 4,
                    formatter : function(label, series) {
                        return '<div style="font-size:8pt;text-align:center;padding:2px;color:white;">'
                            + label
                            + '<br/>'
                            + Math.round10(series.percent, -2)
                            + '%</div>';
                    },
                    background : {
                        opacity : 0.5,
                        color : '#000'
                    }
                }
            }
        },
        legend : {
            show : true
        }
    });

    // Creates APDEX table
    createTable($("#apdexTable"), {"supportsControllersDiscrimination": true, "overall": {"data": [0.0, 500, 1500, "Total"], "isController": false}, "titles": ["Apdex", "T (Toleration threshold)", "F (Frustration threshold)", "Label"], "items": [{"data": [0.0, 500, 1500, "DELETE deleteOne"], "isController": false}, {"data": [0.0, 500, 1500, "POST Login"], "isController": false}, {"data": [0.0, 500, 1500, "POST Create Task"], "isController": false}, {"data": [0.0, 500, 1500, "GET getAll"], "isController": false}, {"data": [0.0, 500, 1500, "GET getOne"], "isController": false}, {"data": [0.0, 500, 1500, "GET getAll (cold start isolation)"], "isController": false}]}, function(index, item){
        switch(index){
            case 0:
                item = item.toFixed(3);
                break;
            case 1:
            case 2:
                item = formatDuration(item);
                break;
        }
        return item;
    }, [[0, 0]], 3);

    // Create statistics table
    createTable($("#statisticsTable"), {"supportsControllersDiscrimination": true, "overall": {"data": ["Total", 7725, 7725, 100.0, 18.15546925566346, 0, 1113, 17.0, 21.0, 22.0, 27.0, 248.0971191829656, 102.02187986760124, 67.84369781128561], "isController": false}, "titles": ["Label", "#Samples", "FAIL", "Error %", "Average", "Min", "Max", "Median", "90th pct", "95th pct", "99th pct", "Transactions/s", "Received", "Sent"], "items": [{"data": ["DELETE deleteOne", 1543, 1543, 100.0, 17.887880751782248, 15, 58, 17.0, 21.0, 21.0, 26.0, 51.64162120552897, 21.18113369758024, 14.171187069095351], "isController": false}, {"data": ["POST Login", 1546, 1546, 100.0, 18.208926261319533, 16, 182, 17.0, 21.0, 21.649999999999864, 29.0, 51.52131169393808, 21.13178799946679, 15.043332337038024], "isController": false}, {"data": ["POST Create Task", 1545, 1545, 100.0, 17.960517799352733, 1, 46, 17.0, 21.0, 22.0, 26.539999999999964, 51.65669196562907, 21.242136303035878, 16.08185454211107], "isController": false}, {"data": ["GET getAll", 1545, 1545, 100.0, 17.91067961165051, 0, 74, 17.0, 21.0, 22.0, 26.539999999999964, 51.6653290529695, 21.41017924023542, 12.22868256545947], "isController": false}, {"data": ["GET getOne", 1545, 1545, 100.0, 18.100323624595482, 15, 101, 17.0, 21.0, 22.0, 29.0, 51.66705681704177, 21.19156627261479, 13.068132534779119], "isController": false}, {"data": ["GET getAll (cold start isolation)", 1, 1, 100.0, 1113.0, 1113, 1113, 1113.0, 1113.0, 1113.0, 1113.0, 0.8984725965858041, 0.36851415094339623, 0.1509153189577718], "isController": false}]}, function(index, item){
        switch(index){
            // Errors pct
            case 3:
                item = item.toFixed(2) + '%';
                break;
            // Mean
            case 4:
            // Mean
            case 7:
            // Median
            case 8:
            // Percentile 1
            case 9:
            // Percentile 2
            case 10:
            // Percentile 3
            case 11:
            // Throughput
            case 12:
            // Kbytes/s
            case 13:
            // Sent Kbytes/s
                item = item.toFixed(2);
                break;
        }
        return item;
    }, [[0, 0]], 0, summaryTableHeader);

    // Create error table
    createTable($("#errorsTable"), {"supportsControllersDiscrimination": false, "titles": ["Type of error", "Number of errors", "% in errors", "% in all samples"], "items": [{"data": ["Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: player-api-tests-production.up.railway.app:443 failed to respond", 5, 0.06472491909385113, 0.06472491909385113], "isController": false}, {"data": ["404/Not Found", 7720, 99.93527508090615, 99.93527508090615], "isController": false}]}, function(index, item){
        switch(index){
            case 2:
            case 3:
                item = item.toFixed(2) + '%';
                break;
        }
        return item;
    }, [[1, 1]]);

        // Create top5 errors by sampler
    createTable($("#top5ErrorsBySamplerTable"), {"supportsControllersDiscrimination": false, "overall": {"data": ["Total", 7725, 7725, "404/Not Found", 7720, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: player-api-tests-production.up.railway.app:443 failed to respond", 5, "", "", "", "", "", ""], "isController": false}, "titles": ["Sample", "#Samples", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors"], "items": [{"data": ["DELETE deleteOne", 1543, 1543, "404/Not Found", 1543, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["POST Login", 1546, 1546, "404/Not Found", 1546, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["POST Create Task", 1545, 1545, "404/Not Found", 1544, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: player-api-tests-production.up.railway.app:443 failed to respond", 1, "", "", "", "", "", ""], "isController": false}, {"data": ["GET getAll", 1545, 1545, "404/Not Found", 1541, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: player-api-tests-production.up.railway.app:443 failed to respond", 4, "", "", "", "", "", ""], "isController": false}, {"data": ["GET getOne", 1545, 1545, "404/Not Found", 1545, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["GET getAll (cold start isolation)", 1, 1, "404/Not Found", 1, "", "", "", "", "", "", "", ""], "isController": false}]}, function(index, item){
        return item;
    }, [[0, 0]], 0);

});
