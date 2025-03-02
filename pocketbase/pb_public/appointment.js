document.addEventListener('DOMContentLoaded', async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const userEmail = urlParams.get('email');

    if (!userEmail) {
        alert("No email found. Please go back to the files page.");
        return;
    }

    const calendarEl = document.getElementById('calendar');

    const calendar = new FullCalendar.Calendar(calendarEl, {
        plugins: [ 'interaction', 'dayGrid', 'timeGrid' ],
        editable: true,
        droppable: true,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: async function(fetchInfo, successCallback, failureCallback) {
            try {
               
                const appointmentResponse = await fetch(`http://127.0.0.1:8090/api/collections/appointment/records?filter=user="${encodeURIComponent(userEmail)}"`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (appointmentResponse.ok) {
                    const data = await appointmentResponse.json();
                    const events = data.items.map(appointment => ({
                        id: appointment.id,
                        title: appointment.appointment_doctor,
                        start: new Date(appointment.datetime).toISOString(),
                        end: new Date(new Date(appointment.datetime).getTime() + 30*60000).toISOString(), // Example end time, adjust as needed
                        description: appointment.reason
                    }));
                    successCallback(events);
                } else {
                    const errorText = await appointmentResponse.text(); // Read error message
                    console.error('Error fetching appointments:', errorText);
                    failureCallback(errorText);
                }
            } catch (error) {
                console.error('Error fetching appointments:', error);
                failureCallback(error);
            }
        },
        dateClick: function(info) {
            // Optional: Handle date clicks if you want to add appointments directly on the calendar
        },
        eventClick: function(info) {
            // Optional: Handle event clicks if you want to display details or edit appointments
        }
    });

    calendar.render();

    document.getElementById('appointmentForm').addEventListener('submit', async function(event) {
        event.preventDefault();

        const datetime = document.getElementById('datetime').value;
        const appointmentDoctor = document.getElementById('appointment_doctor').value;
        const location = document.getElementById('location').value;
        const reason = document.getElementById('reason').value;

        try {
            
            const appointmentResponse = await fetch('http://127.0.0.1:8090/api/collections/appointment/records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user: userEmail,
                    datetime: datetime,
                    appointment_doctor: appointmentDoctor,
                    location: location,
                    reason: reason
                })
            });

            if (appointmentResponse.ok) {
                alert('Appointment scheduled successfully!');
                document.getElementById('appointmentForm').reset();
                calendar.refetchEvents(); 
            } else {
                const errorText = await appointmentResponse.text(); 
                console.error('Error scheduling appointment:', errorText);
                alert('Error scheduling appointment: ' + errorText);
            }
        } catch (error) {
            console.error('Error scheduling appointment:', error);
            alert('An error occurred while scheduling the appointment.');
        }
    });
});
