// Configuration
const API_BASE_URL = 'http://localhost:5000/api'; // Change to your server URL
const UPDATE_INTERVAL = 5000; // 5 seconds
const CHART_UPDATE_INTERVAL = 30000; // 30 seconds
let autoRefreshEnabled = true;
let dataHistory = [];
let charts = {};

// ThingSpeak (set to true to fetch directly from ThingSpeak instead of local API)
const USE_THINGSPEAK = true;
const THINGSPEAK_CHANNEL_ID = '3376690';
const THINGSPEAK_READ_API_KEY = 'KPDGJ1L61ON5GZSJ';
const THINGSPEAK_FEEDS_URL = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json?api_key=${THINGSPEAK_READ_API_KEY}&results=1`;

// Sensor data storage
let currentSensorData = {
    temperature: 0,
    humidity: 0,
    gasLevel: 0,
    status: 0,
    statusText: 'NORMAL',
    timestamp: new Date()
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Smart Helmet Dashboard Initializing...');
    initializeCharts();
    await refreshData();
    initialize3DHelmet();
    
    // Set up auto-refresh
    setInterval(refreshData, UPDATE_INTERVAL);
    setInterval(updateCharts, CHART_UPDATE_INTERVAL);
    
    // Hide loading spinner after 2 seconds
    setTimeout(() => {
        document.getElementById('loadingSpinner').classList.add('hidden');
    }, 2000);
});

// ============== DATA FETCHING ==============

async function refreshData() {
    try {
        let data = null;

        if (USE_THINGSPEAK) {
            // Fetch latest feed from ThingSpeak
            const resp = await fetch(THINGSPEAK_FEEDS_URL);
            if (!resp.ok) throw new Error('ThingSpeak API Error');
            const json = await resp.json();
            if (json && json.feeds && json.feeds.length > 0) {
                const latest = json.feeds[0];
                data = {
                    temperature: parseFloat(latest.field1) || 0,
                    humidity: parseFloat(latest.field2) || 0,
                    gasLevel: parseFloat(latest.field3) || 0,
                    // If your channel provides status in field4 use it, otherwise derive
                    status: latest.field4 ? parseInt(latest.field4) : 0,
                    statusText: 'UNKNOWN',
                    timestamp: latest.created_at ? new Date(latest.created_at) : new Date()
                };
                // Derive a human readable status if not supplied
                if (!latest.field4) {
                    if (data.temperature >= 45 || data.gasLevel >= 800) {
                        data.status = 2; data.statusText = 'DANGER';
                    } else if (data.temperature >= 35 || data.gasLevel >= 400) {
                        data.status = 1; data.statusText = 'WARNING';
                    } else { data.status = 0; data.statusText = 'NORMAL'; }
                } else {
                    data.statusText = data.status === 2 ? 'DANGER' : (data.status === 1 ? 'WARNING' : 'NORMAL');
                }
            } else {
                throw new Error('No feeds in ThingSpeak response');
            }
        } else {
            const response = await fetch(`${API_BASE_URL}/sensors/current`);
            if (!response.ok) throw new Error('API Error');
            data = await response.json();
        }

        currentSensorData = data;

        // Update UI with new data
        updateSensorDisplays();
        updateAlertStatus();
        addDataLog(data);
        updateLastUpdate();

        console.log('📊 Data Updated:', data);
    } catch (error) {
        console.error('❌ Error fetching data:', error);
        showError('Failed to fetch sensor data');
    }
}

function updateSensorDisplays() {
    // Update temperature
    document.getElementById('tempValue').textContent = 
        currentSensorData.temperature.toFixed(1) + '°C';
    
    // Update humidity
    document.getElementById('humidityValue').textContent = 
        currentSensorData.humidity.toFixed(1) + '%';
    
    // Update gas level
    document.getElementById('gasValue').textContent = 
        currentSensorData.gasLevel.toFixed(0) + ' ppm';
    
    // Update gauge charts
    updateGauges();
}

function updateAlertStatus() {
    const indicator = document.getElementById('statusIndicator');
    const alertContainer = document.getElementById('alertContainer');
    const statusText = currentSensorData.statusText;
    
    // Clear previous alert
    alertContainer.innerHTML = '';
    
    // Update status indicator
    indicator.className = 'status-indicator';
    indicator.querySelector('.status-text').textContent = statusText;
    
    let alertHTML = '';
    
    if (statusText === 'NORMAL') {
        alertHTML = `
            <div class="alert-normal">
                <span class="alert-icon">✅</span>
                <span class="alert-message">All systems operating normally</span>
            </div>
        `;
    } else if (statusText === 'WARNING') {
        indicator.classList.add('warning');
        alertHTML = `
            <div class="alert-warning">
                <span class="alert-icon">⚠️</span>
                <span class="alert-message">WARNING! Suboptimal conditions detected. Please check readings.</span>
            </div>
            <div class="alert-details">
                <p>Temperature: ${currentSensorData.temperature.toFixed(1)}°C</p>
                <p>Humidity: ${currentSensorData.humidity.toFixed(1)}%</p>
                <p>Gas Level: ${currentSensorData.gasLevel.toFixed(0)} ppm</p>
            </div>
        `;
    } else if (statusText === 'DANGER') {
        indicator.classList.add('danger');
        alertHTML = `
            <div class="alert-danger">
                <span class="alert-icon">🚨</span>
                <span class="alert-message">CRITICAL DANGER! IMMEDIATE EVACUATION REQUIRED!</span>
            </div>
            <div class="alert-details">
                <p><strong>Temperature:</strong> ${currentSensorData.temperature.toFixed(1)}°C</p>
                <p><strong>Humidity:</strong> ${currentSensorData.humidity.toFixed(1)}%</p>
                <p><strong>Gas Level:</strong> ${currentSensorData.gasLevel.toFixed(0)} ppm</p>
                <p style="color: var(--danger-color); margin-top: 10px;">Emergency protocols activated. Calling authorities...</p>
            </div>
        `;
        // Trigger visual alert animation
        triggerDangerAnimation();
    }
    
    alertContainer.innerHTML = alertHTML;
}

function triggerDangerAnimation() {
    const container = document.querySelector('.alert-container');
    container.style.animation = 'none';
    setTimeout(() => {
        container.style.animation = 'pulse-alert 0.5s ease-in-out infinite';
    }, 10);
}

function updateLastUpdate() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastUpdate').textContent = timeString;
}

// ============== GAUGE CHARTS ==============

function initializeCharts() {
    // Create gauge chart context
    const tempCtx = document.getElementById('tempGauge').getContext('2d');
    const humidityCtx = document.getElementById('humidityGauge').getContext('2d');
    const gasCtx = document.getElementById('gasGauge').getContext('2d');
    
    // Create temp gauge
    charts.tempGauge = createGaugeChart(tempCtx, 'Temperature', -5, 50, 0);
    charts.humidityGauge = createGaugeChart(humidityCtx, 'Humidity', 10, 95, 0);
    charts.gasGauge = createGaugeChart(gasCtx, 'Gas Level', 0, 1000, 0);
    
    // Create line charts
    const tempLineCtx = document.getElementById('tempChart').getContext('2d');
    const humidityLineCtx = document.getElementById('humidityChart').getContext('2d');
    const gasLineCtx = document.getElementById('gasChart').getContext('2d');
    const alertPieCtx = document.getElementById('alertChart').getContext('2d');
    
    charts.tempLine = new Chart(tempLineCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#ff6b6b',
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ff6b6b',
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: createChartOptions('Temperature Trend')
    });
    
    charts.humidityLine = new Chart(humidityLineCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Humidity (%)',
                data: [],
                borderColor: '#4dabf7',
                backgroundColor: 'rgba(77, 171, 247, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#4dabf7',
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: createChartOptions('Humidity Trend')
    });
    
    charts.gasLine = new Chart(gasLineCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Gas Level (ppm)',
                data: [],
                borderColor: '#ffa500',
                backgroundColor: 'rgba(255, 165, 0, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ffa500',
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: createChartOptions('Gas Level Trend')
    });
    
    charts.alertPie = new Chart(alertPieCtx, {
        type: 'doughnut',
        data: {
            labels: ['Normal', 'Warning', 'Danger'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(0, 255, 65, 0.8)',
                    'rgba(255, 165, 0, 0.8)',
                    'rgba(255, 23, 68, 0.8)'
                ],
                borderColor: [
                    '#00ff41',
                    '#ffa500',
                    '#ff1744'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#b0b8d4',
                        font: { size: 12 }
                    }
                }
            }
        }
    });
}

function createGaugeChart(ctx, label, min, max, value) {
    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [label],
            datasets: [{
                data: [value, max - value],
                backgroundColor: ['#00d4ff', 'rgba(0, 212, 255, 0.1)'],
                borderColor: ['#00d4ff', 'rgba(0, 212, 255, 0.3)'],
                borderWidth: 2,
                circumference: 180,
                rotation: 270
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

function createChartOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                display: true,
                labels: {
                    color: '#b0b8d4',
                    font: { size: 11 }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(45, 53, 97, 0.3)' },
                ticks: { color: '#b0b8d4' }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#b0b8d4' }
            }
        }
    };
}

function updateGauges() {
    // Update temperature gauge
    charts.tempGauge.data.datasets[0].data = [
        currentSensorData.temperature,
        50 - currentSensorData.temperature
    ];
    charts.tempGauge.update();
    
    // Update humidity gauge
    charts.humidityGauge.data.datasets[0].data = [
        currentSensorData.humidity,
        95 - currentSensorData.humidity
    ];
    charts.humidityGauge.update();
    
    // Update gas gauge
    charts.gasGauge.data.datasets[0].data = [
        currentSensorData.gasLevel,
        1000 - currentSensorData.gasLevel
    ];
    charts.gasGauge.update();
}

async function updateCharts() {
    try {
        // Fetch history
        const historyResponse = await fetch(`${API_BASE_URL}/sensors/history?results=100`);
        const history = await historyResponse.json();
        
        // Fetch analytics
        const analyticsResponse = await fetch(`${API_BASE_URL}/analytics`);
        const analytics = await analyticsResponse.json();
        
        if (history.length > 0) {
            // Update line charts
            const labels = history.map(d => {
                const date = new Date(d.timestamp);
                return date.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            });
            
            const temps = history.map(d => d.temperature);
            const humidities = history.map(d => d.humidity);
            const gases = history.map(d => d.gasLevel);
            
            charts.tempLine.data.labels = labels;
            charts.tempLine.data.datasets[0].data = temps;
            charts.tempLine.update();
            
            charts.humidityLine.data.labels = labels;
            charts.humidityLine.data.datasets[0].data = humidities;
            charts.humidityLine.update();
            
            charts.gasLine.data.labels = labels;
            charts.gasLine.data.datasets[0].data = gases;
            charts.gasLine.update();
        }
        
        // Update alert pie chart
        charts.alertPie.data.datasets[0].data = [
            analytics.alerts.normal,
            analytics.alerts.warning,
            analytics.alerts.danger
        ];
        charts.alertPie.update();
        
        // Update statistics
        document.getElementById('statAvgTemp').textContent = 
            analytics.temperature.avg + ' °C';
        document.getElementById('statAvgHumidity').textContent = 
            analytics.humidity.avg + ' %';
        document.getElementById('statAvgGas').textContent = 
            analytics.gasLevel.avg + ' ppm';
        document.getElementById('statTotalAlerts').textContent = 
            (analytics.alerts.warning + analytics.alerts.danger) + ' 🚨';
        
    } catch (error) {
        console.error('❌ Error updating charts:', error);
    }
}

// ============== 3D HELMET MODEL ==============

function initialize3DHelmet() {
    const container = document.getElementById('helmetCanvas');
    if (!container) return;
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e27);
    
    const camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.z = 5;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0x00d4ff, 1);
    pointLight.position.set(5, 5, 5);
    pointLight.castShadow = true;
    scene.add(pointLight);
    
    // Create helmet
    const helmet = createHelmetGeometry();
    scene.add(helmet);
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        helmet.rotation.x += 0.005;
        helmet.rotation.y += 0.01;
        
        // Change helmet color based on status
        updateHelmetColor(helmet);
        
        renderer.render(scene, camera);
    }
    animate();
    
    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

function createHelmetGeometry() {
    const group = new THREE.Group();
    
    // Main helmet shell
    const shellGeometry = new THREE.SphereGeometry(2, 32, 32);
    const shellMaterial = new THREE.MeshPhongMaterial({
        color: 0x00d4ff,
        emissive: 0x004080,
        shininess: 100,
        wireframe: false
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);
    
    // Visor (front protection)
    const visorGeometry = new THREE.BoxGeometry(2.5, 1.5, 0.3);
    const visorMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ffff,
        emissive: 0x0099ff,
        shininess: 50,
        transparent: true,
        opacity: 0.6
    });
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.z = 2;
    visor.castShadow = true;
    group.add(visor);
    
    // Sensors visualization
    const sensorGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    
    // Temperature sensor (red)
    const tempSensorMaterial = new THREE.MeshPhongMaterial({
        color: 0xff6b6b,
        emissive: 0xff0000,
        shininess: 100
    });
    const tempSensor = new THREE.Mesh(sensorGeometry, tempSensorMaterial);
    tempSensor.position.set(-1, 1, 2);
    tempSensor.castShadow = true;
    group.add(tempSensor);
    
    // Humidity sensor (blue)
    const humiditySensorMaterial = new THREE.MeshPhongMaterial({
        color: 0x4dabf7,
        emissive: 0x0099ff,
        shininess: 100
    });
    const humiditySensor = new THREE.Mesh(sensorGeometry, humiditySensorMaterial);
    humiditySensor.position.set(1, 1, 2);
    humiditySensor.castShadow = true;
    group.add(humiditySensor);
    
    // Gas sensor (orange)
    const gasSensorMaterial = new THREE.MeshPhongMaterial({
        color: 0xffa500,
        emissive: 0xff6600,
        shininess: 100
    });
    const gasSensor = new THREE.Mesh(sensorGeometry, gasSensorMaterial);
    gasSensor.position.set(0, -1, 2);
    gasSensor.castShadow = true;
    group.add(gasSensor);
    
    // Add pulse animation to sensors
    group.sensors = [tempSensor, humiditySensor, gasSensor];
    
    return group;
}

function updateHelmetColor(helmet) {
    const shell = helmet.children[0];
    const statusColors = {
        'NORMAL': { color: 0x00d4ff, emissive: 0x004080 },
        'WARNING': { color: 0xffa500, emissive: 0xff6600 },
        'DANGER': { color: 0xff1744, emissive: 0xff0000 }
    };
    
    const colorConfig = statusColors[currentSensorData.statusText] || statusColors['NORMAL'];
    shell.material.color.setHex(colorConfig.color);
    shell.material.emissive.setHex(colorConfig.emissive);
    
    // Pulse sensors
    if (helmet.sensors) {
        helmet.sensors.forEach((sensor, index) => {
            const scale = 1 + Math.sin(Date.now() * 0.003 + index) * 0.2;
            sensor.scale.set(scale, scale, scale);
        });
    }
}

// ============== DATA LOGGING ==============

function addDataLog(data) {
    const logContainer = document.getElementById('dataLog');
    const timestamp = new Date().toLocaleTimeString();
    
    let logClass = 'log-normal';
    if (data.statusText === 'WARNING') logClass = 'log-warning';
    if (data.statusText === 'DANGER') logClass = 'log-danger';
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${logClass}`;
    logEntry.innerHTML = `
        <span class="log-time">${timestamp}</span>
        <strong>${data.statusText}</strong> | 
        T: ${data.temperature.toFixed(1)}°C | 
        H: ${data.humidity.toFixed(1)}% | 
        G: ${data.gasLevel.toFixed(0)} ppm
    `;
    
    logContainer.insertBefore(logEntry, logContainer.firstChild);
    
    // Keep only last 50 entries
    const entries = logContainer.querySelectorAll('.log-entry');
    if (entries.length > 50) {
        entries[entries.length - 1].remove();
    }
}

// ============== CONTROL FUNCTIONS ==============

function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    const button = event.target;
    button.querySelector('#autoRefreshStatus').textContent = autoRefreshEnabled ? 'ON' : 'OFF';
}

async function testEmailAlert() {
    try {
        const response = await fetch(`${API_BASE_URL}/alert/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'email' })
        });
        const result = await response.json();
        showNotification('✅ Test email sent!');
        console.log('Test email response:', result);
    } catch (error) {
        console.error('Error sending test email:', error);
        showNotification('❌ Failed to send test email');
    }
}

async function testPhoneAlert() {
    try {
        const response = await fetch(`${API_BASE_URL}/alert/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'call' })
        });
        const result = await response.json();
        showNotification('📞 Test call initiated!');
        console.log('Test call response:', result);
    } catch (error) {
        console.error('Error sending test call:', error);
        showNotification('❌ Failed to initiate test call');
    }
}

// ============== UTILITY FUNCTIONS ==============

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 212, 255, 0.9);
        color: #0a0e27;
        padding: 15px 25px;
        border-radius: 10px;
        font-weight: 600;
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showError(message) {
    showNotification('❌ ' + message);
}
