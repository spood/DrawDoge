$( document ).ready(function() {

  $(".alert").alert();

  $('#createAccount').on('click', function (e) {
      $('#confirm').modal({show:true});
  });

  $("#createAccountFinal").click(function() {
    var username = $("#accountUsername").val();
    var password1 = $("#accountPassword").val();
    var password2 = $("#accountPassword2").val();
    var email = $("#accountEmail").val();
    var dataString = 'username='+ username + '&password1=' + password1 + '&password2=' + password2 + '&email=' + email;
    $.ajax({
      type: "POST",
      url: "/createAccount",
      data: dataString,
      success: function(data) {
        if (data.redirect) {
          $('#confirm').modal({show:false});
          window.location.href = data.redirect;
        }
        else {
          $('#errorLabel').text(data.msg);
        }
      }
    });
    return false;
  });

});
