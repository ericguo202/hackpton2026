import cv2
cap = cv2.VideoCapture(0)

# Check if the camera opened successfully
if not cap.isOpened():
    print("Error: Could not open camera")
    exit()

while True:
    # Capture frame-by-frame
    ret, frame = cap.read()

    # If frame reading failed, break
    if not ret:
        print("Error: Can't receive frame")
        break

    # Display the resulting frame
    cv2.imshow('Camera', frame)

    # Press 'q' to exit the loop
    if cv2.waitKey(1) == ord('q'):
        break

# Release the capture and destroy windows
cap.release()
cv2.destroyAllWindows()